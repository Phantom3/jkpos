/**
 * Delivery POS Bridge for Grubhub & Uber Eats Android Tablets (v2.1)
 * Hardware Target: Xprinter XP-K200L / XK-200L (POS-80C) Thermal Printers
 * 
 * Emulates:
 * - Star Micronics TSP143III (LAN) on UDP 22222, TCP 9100, TCP 9101
 * - Epson ePOS XML printer on HTTP 80 & 8008
 * 
 * Features:
 * - High-fidelity StarPRNT raster to ESC/POS conversion (normalized 576 dots / 72 bytes)
 * - Full ETB counter handshaking
 * - Guarded stream writes & robust debounce flushing
 */

const dgram = require('dgram');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { recognizeRasterLines } = require('./ocr');
const { parseReceiptText, insertJkOpenOrder } = require('./jk_orders');
const { triggerPandoraLaunch } = require('./roku_pandora');

const LOG_FILE = path.join(__dirname, 'bridge.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {}
}

// Global error handlers
process.on('uncaughtException', (err) => {
  log(`[UNCAUGHT] ${err.stack || err.message}`);
});
process.on('unhandledRejection', (reason) => {
  log(`[REJECTION] ${reason}`);
});

const CONFIG_FILE = path.join(__dirname, 'config.json');

let CONFIG = {
  localIp: '192.168.2.229',
  localMac: '44:38:E8:74:CA:98',
  subnetMask: [255, 255, 255, 0],
  gateway: [192, 168, 2, 1],
  discoveryPort: 22222,
  printPort: 9100,
  statusPort: 9101,
  eposPorts: [80, 8008],
  adminPort: 8080,
  targetPrinters: [],
  settings: {
    copies: 1,
    beeps: 5,
    beepDuration: 4
  }
};

let pendingOnlineOrders = [];
let menuCache = [];

async function loadMenuCache() {
  try {
    const { getPool } = require('C:/Users/Dunesuser/jkrestaurant-web/backend/db');
    const pool = await getPool();
    const r = await pool.request().query('SELECT ItemIDN, Name, Price FROM rItem WHERE IsActive = 1');
    menuCache = r.recordset;
    log(`[Menu] Cached ${menuCache.length} menu items from rItem for online order matching`);
  } catch (err) {
    log(`[Menu Error] Failed to load menu: ${err.message}`);
  }
}
loadMenuCache();
setInterval(loadMenuCache, 5 * 60 * 1000);

function matchMenuItem(query) {
  if (!query || menuCache.length === 0) {
    return { id: 36701000, name: 'Custom Sandwich' };
  }
  const clean = query.replace(/\$[\d\.]+/g, '').replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (clean.length < 3) return null;

  // Reject instructions, modifiers, and non-item words
  if (/^(no|extra|add|sub|remove|on|with|without|light|side|please|thank|well|cut|dressed|note|notes|instructions?)\b/i.test(clean)) {
    return null;
  }

  // 1. Exact match
  let m = menuCache.find(i => i.Name.toLowerCase() === clean);
  if (m) return { id: m.ItemIDN, name: m.Name };

  // 2. Exact word boundaries match
  const wordRegex = new RegExp('\\b' + clean + '\\b', 'i');
  m = menuCache.find(i => wordRegex.test(i.Name));
  if (m) return { id: m.ItemIDN, name: m.Name };

  // 3. Substring match (longest menu name first)
  const sortedMenu = [...menuCache].sort((a,b) => b.Name.length - a.Name.length);
  m = sortedMenu.find(i => i.Name.length >= 4 && (clean.includes(i.Name.toLowerCase()) || i.Name.toLowerCase().includes(clean)));
  if (m) return { id: m.ItemIDN, name: m.Name };

  // 4. Token match (all words in clean match words in item name)
  const tokens = clean.split(' ').filter(w => w.length >= 3);
  if (tokens.length >= 2) {
    m = sortedMenu.find(i => tokens.every(t => i.Name.toLowerCase().includes(t)));
    if (m) return { id: m.ItemIDN, name: m.Name };
  }

  // 5. Sandwich category fallback
  if (/sandwich|hero|roll|wrap|panini|club|blt|burger|sub/i.test(clean)) {
    return { id: 36701000, name: 'Custom Sandwich' };
  }

  return null;
}

function buildJkOnlineOrderXml(order) {
  if (!order) {
    return '<?xml version="1.0" encoding="UTF-8"?><GetNewOrdersResponse><ResultCode>0</ResultCode><TotalRecords>0</TotalRecords></GetNewOrdersResponse>';
  }

  const platform = order.platform || 'Uber Eats';
  const orderId = order.orderId || ('UBR-' + Math.floor(1000 + Math.random() * 9000));
  const rawCust = (order.customerName || 'Online Guest').replace(/^(customer|name|for):?/i, '').trim();
  const nameParts = rawCust.split(' ');
  const firstName = nameParts[0] || 'Uber';
  const lastName = nameParts.slice(1).join(' ') || 'Customer';

  let itemsXml = '';
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      const matched = matchMenuItem(item.name);
      if (!matched) {
        log(`[Matcher] Skipped non-item line: "${item.name}"`);
        continue;
      }

      const posId = item.pos_id || matched.id;
      const itemName = matched.name || 'Custom Sandwich';
      const qty = item.qty || 1;
      const notes = item.notes ? `<modifier><name>${item.notes.replace(/[<>&]/g, '')}</name></modifier>` : '';
      itemsXml += `
        <item>
          <pos_id>${posId}</pos_id>
          <name>${itemName.replace(/[<>&]/g, '')}</name>
          <quantity>${qty}</quantity>
          <price>0.00</price>
          ${notes}
        </item>`;
    }
  }

  if (!itemsXml) {
    itemsXml = `
      <item>
        <pos_id>36701000</pos_id>
        <name>Custom Sandwich</name>
        <quantity>1</quantity>
        <price>0.00</price>
      </item>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<GetNewOrdersResponse>
  <ResultCode>0</ResultCode>
  <TotalRecords>1</TotalRecords>
  <ticket>
    <order_id>${orderId.replace(/[<>&]/g, '')}</order_id>
    <provider>${platform.replace(/[<>&]/g, '')}</provider>
    <type>TAKEOUT</type>
    <comments>Online Delivery Order (Prepaid)</comments>
    <customer>
      <firstname>${firstName.replace(/[<>&]/g, '')}</firstname>
      <lastname>${lastName.replace(/[<>&]/g, '')}</lastname>
      <phone>555-0100</phone>
    </customer>
    <company_name>${platform.replace(/[<>&]/g, '')}</company_name>
    <guestname>${platform.toUpperCase()} ${rawCust.replace(/[<>&]/g, '')}</guestname>
    <items>
      ${itemsXml}
    </items>
    <subtotal>0.00</subtotal>
    <tax>0.00</tax>
    <total>0.00</total>
  </ticket>
</GetNewOrdersResponse>`;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (data.targetPrinters) CONFIG.targetPrinters = data.targetPrinters;
      if (data.settings) CONFIG.settings = Object.assign(CONFIG.settings, data.settings);
      log(`[Config] Loaded configuration: ${CONFIG.targetPrinters.length} printers, ${CONFIG.settings.copies} copy(ies), ${CONFIG.settings.beeps} beeps`);
    }
  } catch (e) {
    log(`[Config Error] Failed to load config.json: ${e.message}`);
  }
}

// Watch config file for external changes
try {
  fs.watch(CONFIG_FILE, (eventType) => {
    if (eventType === 'change') {
      log(`[Config] Detected change in config.json, reloading...`);
      loadConfig();
    }
  });
} catch (e) {}

loadConfig();

// -----------------------------------------------------------------------------
// STAR PROTOCOL STATUS FRAMES
// -----------------------------------------------------------------------------
function createAsbFrame(etbCount = 0, etbExecuted = false) {
  const frame = Buffer.alloc(11, 0);
  frame[0] = 0x23; // Header: encodes frame size
  frame[1] = 0x86; // Version: LAN format flag set (0x80 | 0x06)
  frame[2] = etbExecuted ? 0x02 : 0x00; // Bit 1: ETB executed
  
  // Byte 7: 5-bit ETB counter scattered: ((c & 7) << 1) | ((c & 0x18) << 2)
  const c = etbCount & 0x1F;
  frame[7] = ((c & 0x07) << 1) | ((c & 0x18) << 2);
  
  return frame;
}

let globalLatestAsb = createAsbFrame(0, false);

function buildStarDiscoveryPacket(ip, mac) {
  const hexTemplate =
    "5354525f424341535400000000000000" +
    "5253312e302e3100012e00220074008a" +
    "012c00525453503130304c414e000000" +
    "0000000056322e320000000056322e32" +
    "00000000200000000000000031000011" +
    "6213deef00000000c0a8008444484350" +
    "000000000000000000000000ffffff00" +
    "c0a80001001631000000000000000000" +
    "0000000030003100310000a253746172" +
    "00000000000000000000000000000000" +
    "00000000000000000000000053544152" +
    "00000000000000000000000000000000" +
    "00000000000000000000000054535031" +
    "34334949494c414e20285354525f542d" +
    "30303129000000000000000000000000" +
    "00000000000000000000000000000000" +
    "0000000000000000000000005052494e" +
    "54455200000000000000000000000000" +
    "0000000000000000000000000002";

  const buf = Buffer.from(hexTemplate, 'hex');

  buf.fill(0, 0x24, 0x34);
  buf.write("TSP143III", 0x24, 'ascii');

  const macBytes = Buffer.from(mac.replace(/[:-]/g, ''), 'hex');
  macBytes.copy(buf, 0x4E);

  const ipOctets = ip.split('.').map(Number);
  Buffer.from(ipOctets).copy(buf, 0x58);

  Buffer.from(CONFIG.subnetMask).copy(buf, 0x6C);
  Buffer.from(CONFIG.gateway).copy(buf, 0x70);

  buf.fill(0, 0xCC, 0x10C);
  buf.write("TSP143IIILAN (STR_T-001)", 0xCC, 'ascii');

  return buf;
}

// -----------------------------------------------------------------------------
// 1. STAR UDP DISCOVERY RESPONDER (UDP 22222)
// -----------------------------------------------------------------------------
function startDiscoveryServer() {
  const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const responsePacket = buildStarDiscoveryPacket(CONFIG.localIp, CONFIG.localMac);

  server.on('message', (msg, rinfo) => {
    if (msg.length >= 9 && msg.toString('ascii', 0, 9) === 'STR_BCAST') {
      log(`[Discovery] Query received from ${rinfo.address}:${rinfo.port}`);
      server.send(responsePacket, rinfo.port, rinfo.address, (err) => {
        if (err) log(`[Discovery] Send error: ${err.message}`);
        else log(`[Discovery] Sent TSP143III identity to ${rinfo.address}:${rinfo.port}`);
      });
    }
  });

  server.on('error', (err) => {
    log(`[Discovery] UDP Server error: ${err.message}`);
  });

  server.bind(CONFIG.discoveryPort, () => {
    server.setBroadcast(true);
    log(`[Discovery] Active on UDP ${CONFIG.discoveryPort}`);
  });
}

// -----------------------------------------------------------------------------
// 2. STARIO STATUS POLLING SERVER (TCP 9101)
// -----------------------------------------------------------------------------
function startStatusServer() {
  const server = net.createServer((socket) => {
    socket.setTimeout(3000);

    socket.on('data', (data) => {
      // 51-byte query starting with 0x32
      if (data.length > 0 && data[0] === 0x32) {
        const response = Buffer.concat([globalLatestAsb, globalLatestAsb]);
        if (socket.writable) {
          socket.write(response, () => socket.end());
        }
      }
    });

    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
  });

  server.listen(CONFIG.statusPort, () => {
    log(`[Status] Active on TCP ${CONFIG.statusPort}`);
  });
}

// -----------------------------------------------------------------------------
// POST-PRINT AUDIO ALARM & BEEPER
// -----------------------------------------------------------------------------
function getBeepAlarmCommand() {
  const beeps = (CONFIG.settings && typeof CONFIG.settings.beeps === 'number') ? CONFIG.settings.beeps : 5;
  const duration = (CONFIG.settings && typeof CONFIG.settings.beepDuration === 'number') ? CONFIG.settings.beepDuration : 4;
  
  if (beeps <= 0) return Buffer.alloc(0);

  return Buffer.from([
    0x1B, 0x42, beeps, duration,  // ESC B n t: Dynamic beeps
    0x07,                         // ASCII BEL: Chime
    0x1B, 0x43, beeps, duration,  // ESC C n t: Alternative buzzer command
    0x1B, 0x70, 0x00, 0x32, 0xFF, // Pulse pin 2 (external kitchen buzzer)
    0x1B, 0x70, 0x01, 0x32, 0xFF  // Pulse pin 5 (external kitchen buzzer)
  ]);
}

// -----------------------------------------------------------------------------
// 3. HIGH-FIDELITY RASTER TRANSLATOR (StarPRNT -> ESC/POS)
// -----------------------------------------------------------------------------
function convertStarPRNTRasterToEscPos(buf) {
  if (!buf || buf.length === 0) return null;

  const FULL_WIDTH = 72; // Standard 80mm printhead width (576 dots / 8 = 72 bytes)
  const rasterLines = [];
  let inRaster = false;
  let offset = 0;

  while (offset < buf.length) {
    // ESC * r commands
    if (buf[offset] === 0x1B && buf[offset + 1] === 0x2A && buf[offset + 2] === 0x72) {
      const sub = String.fromCharCode(buf[offset + 3]);
      if (sub === 'A') {
        inRaster = true;
        offset += 4;
        continue;
      } else if (sub === 'B') {
        inRaster = false;
        offset += 4;
        continue;
      } else if (sub === 'Y') {
        // Vertical blank skip
        let count = 0;
        if (offset + 4 < buf.length && buf[offset + 4] >= 0x30 && buf[offset + 4] <= 0x39) {
          const nullIdx = buf.indexOf(0x00, offset + 4);
          if (nullIdx !== -1 && nullIdx - (offset + 4) <= 6) {
            const numStr = buf.slice(offset + 4, nullIdx).toString('ascii');
            count = parseInt(numStr, 10) || 0;
            offset = nullIdx + 1;
          } else {
            offset += 4;
          }
        } else if (offset + 5 < buf.length) {
          count = buf[offset + 4] | (buf[offset + 5] << 8);
          offset += 6;
        } else {
          offset += 4;
        }

        if (count > 0 && count < 3000) {
          const blankRow = Buffer.alloc(FULL_WIDTH, 0);
          for (let j = 0; j < count; j++) {
            rasterLines.push(blankRow);
          }
        }
        continue;
      }
      offset += 4;
      continue;
    }

    // Raster row: 'b' (0x62) or 'k' (0x6B)
    if (inRaster && (buf[offset] === 0x62 || buf[offset] === 0x6B) && offset + 3 <= buf.length) {
      const len = buf[offset + 1] | (buf[offset + 2] << 8);
      offset += 3;
      const row = Buffer.alloc(FULL_WIDTH, 0);
      if (len > 0 && offset + len <= buf.length) {
        buf.copy(row, 0, offset, offset + Math.min(len, FULL_WIDTH));
        offset += len;
      }
      rasterLines.push(row);
      continue;
    }

    // Fallback: If inRaster wasn't explicitly flagged but standard 'b' line found
    if (!inRaster && buf[offset] === 0x62 && offset + 3 <= buf.length) {
      const len = buf[offset + 1] | (buf[offset + 2] << 8);
      if (len > 0 && len <= 72 && offset + 3 + len <= buf.length) {
        offset += 3;
        const row = Buffer.alloc(FULL_WIDTH, 0);
        buf.copy(row, 0, offset, offset + len);
        rasterLines.push(row);
        offset += len;
        continue;
      }
    }

    offset++;
  }

  if (rasterLines.length === 0) {
    const hasText = buf.some(b => (b >= 0x20 && b <= 0x7E));
    const isControlOnly = buf.every(b => b < 0x20 || b === 0x1B || b === 0x1E || b === 0x2A || b === 0x72 || b === 0x41 || b === 0x42);
    if (!hasText || isControlOnly || buf.length < 10) {
      return null;
    }

    log(`[Parser] Forwarding non-raster stream (${buf.length} bytes)`);

    // Sync non-raster order to JKRestaurant POS
    if (CONFIG.settings && CONFIG.settings.syncToJkPos !== false) {
      const textLines = buf.toString('latin1').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const orderData = parseReceiptText(textLines);
      if (orderData) {
        pendingOnlineOrders.push(orderData);
        log(`[Queue] Queued text order ${orderData.orderId} (${orderData.platform}: ${orderData.customerName}) for POS delivery!`);
      }
    }

    const chunks = [buf];
    if (!buf.includes(0x1D) || !buf.includes(0x56)) {
      chunks.push(Buffer.from([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x41, 0x03]));
    }
    chunks.push(getBeepAlarmCommand());
    return Buffer.concat(chunks);
  }

  log(`[Parser] Successfully decoded ${rasterLines.length} raster lines normalized to ${FULL_WIDTH} bytes/row (576 dots).`);

  // Asynchronous POS Order Integration via OCR
  if (CONFIG.settings && CONFIG.settings.syncToJkPos !== false && rasterLines.length >= 100) {
    recognizeRasterLines(rasterLines).then(textLines => {
      if (textLines && textLines.length > 0) {
        log(`[OCR] Extracted ${textLines.length} lines of text from receipt image.`);
        const orderData = parseReceiptText(textLines);
        if (orderData) {
          pendingOnlineOrders.push(orderData);
          log(`[Queue] Queued raster order ${orderData.orderId} (${orderData.platform}: ${orderData.customerName}) for POS delivery!`);
          if (orderData.items && orderData.items.some(it => /pandora/i.test(it.name))) {
            triggerPandoraLaunch('Tablet Delivery Print');
          }
        }
      }
    }).catch(err => log(`[OCR Error] ${err.message}`));
  }

  const escPosChunks = [];
  escPosChunks.push(Buffer.from([0x1B, 0x40])); // ESC @ initialize printer

  // Split into manageable blocks of up to 400 lines
  const CHUNK_HEIGHT = 400;
  for (let i = 0; i < rasterLines.length; i += CHUNK_HEIGHT) {
    const chunk = rasterLines.slice(i, i + CHUNK_HEIGHT);
    const height = chunk.length;
    const blockData = Buffer.concat(chunk);

    // ESC/POS GS v 0 raster command
    const header = Buffer.from([
      0x1D, 0x76, 0x30, 0x00,
      FULL_WIDTH & 0xFF, (FULL_WIDTH >> 8) & 0xFF,
      height & 0xFF, (height >> 8) & 0xFF
    ]);
    escPosChunks.push(header);
    escPosChunks.push(blockData);
  }

  // Feed 4 lines and full cut: GS V 65 3
  escPosChunks.push(Buffer.from([0x1D, 0x56, 0x41, 0x03]));
  // Trigger audio beeps & alarm
  escPosChunks.push(getBeepAlarmCommand());

  return Buffer.concat(escPosChunks);
}

// -----------------------------------------------------------------------------
// 4. FORWARD PAYLOAD TO PHYSICAL XP-200L
// -----------------------------------------------------------------------------
function forwardToPrinters(payload) {
  if (!payload || !Buffer.isBuffer(payload) || payload.length === 0) {
    return;
  }

  const copies = (CONFIG.settings && typeof CONFIG.settings.copies === 'number') ? Math.max(1, CONFIG.settings.copies) : 1;

  for (let c = 0; c < copies; c++) {
    CONFIG.targetPrinters.forEach((p) => {
      if (!p.enabled) return;

      if (p.smbPath) {
        log(`[Relay] (Copy ${c + 1}/${copies}) Writing to SMB shared printer ${p.name} (${p.smbPath})...`);
        fs.writeFile(p.smbPath, payload, (err) => {
          if (err) {
            log(`[Relay] Error writing to SMB ${p.name}: ${err.message}`);
          } else {
            log(`[Relay] Dispatched ticket copy ${c + 1}/${copies} (${payload.length} bytes) to ${p.name}`);
          }
        });
        return;
      }

      if (p.ip && p.port) {
        log(`[Relay] (Copy ${c + 1}/${copies}) Connecting to ${p.name} (${p.ip}:${p.port})...`);
        const client = new net.Socket();
        client.setTimeout(4000);

        client.connect(p.port, p.ip, () => {
          client.write(payload, () => {
            client.end();
            log(`[Relay] Dispatched ticket copy ${c + 1}/${copies} (${payload.length} bytes) to ${p.name}`);
          });
        });

        client.on('error', (err) => {
          log(`[Relay] Error sending to ${p.name}: ${err.message}`);
        });

        client.on('timeout', () => {
          log(`[Relay] Timeout connecting to ${p.name}`);
          client.destroy();
        });
      }
    });
  }
}

// -----------------------------------------------------------------------------
// 5. STARPRNT PRINT SERVER (TCP 9100)
// -----------------------------------------------------------------------------
function startPrintServer() {
  const server = net.createServer((socket) => {
    let clientEtbCounter = 0;
    let bufferQueue = [];
    let debounceTimer = null;
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;

    log(`[Print] Connection from ${remote}`);

    function flushAndPrint() {
      if (bufferQueue.length === 0) return;
      const fullBuffer = Buffer.concat(bufferQueue);
      bufferQueue = [];
      const escPosPayload = convertStarPRNTRasterToEscPos(fullBuffer);
      if (escPosPayload) {
        forwardToPrinters(escPosPayload);
      }
    }

    socket.on('data', (chunk) => {
      bufferQueue.push(chunk);

      // Check for ESC RS E 0 (Reset ETB counter)
      for (let i = 0; i <= chunk.length - 4; i++) {
        if (chunk[i] === 0x1B && chunk[i+1] === 0x1E && chunk[i+2] === 0x45 && chunk[i+3] === 0x00) {
          log(`[Print] Clear ETB counter from ${remote}`);
          clientEtbCounter = 0;
          globalLatestAsb = createAsbFrame(0, false);
        }
      }

      // Count ETB markers
      let etbCount = 0;
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0x17) {
          etbCount++;
          clientEtbCounter = (clientEtbCounter + 1) & 0x1F;
        }
      }

      if (etbCount > 0) {
        const asb = createAsbFrame(clientEtbCounter, true);
        globalLatestAsb = asb;
        if (socket.writable) {
          socket.write(asb);
        }
      }

      // Reset quiet debounce timer (500ms quiet = end of job)
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const totalBytes = bufferQueue.reduce((acc, c) => acc + c.length, 0);
        if (totalBytes > 20) {
          log(`[Print] Stream quiet timeout reached (${totalBytes} bytes). Flushing job...`);
        }
        flushAndPrint();
      }, 500);
    });

    socket.on('end', () => {
      log(`[Print] Client ${remote} finished transmission`);
      if (debounceTimer) clearTimeout(debounceTimer);
      flushAndPrint();

      if (socket.writable) {
        const finalAsb = createAsbFrame(clientEtbCounter, false);
        socket.write(finalAsb, () => socket.end());
      }
    });

    socket.on('close', () => {
      log(`[Print] Closed ${remote}`);
      if (debounceTimer) clearTimeout(debounceTimer);
      flushAndPrint();
    });

    socket.on('error', (err) => {
      log(`[Print] Socket error with ${remote}: ${err.message}`);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log(`[Startup] Port ${CONFIG.printPort} is already in use by another instance. Exiting duplicate.`);
      process.exit(0);
    } else {
      log(`[Print Server Error] ${err.message}`);
    }
  });

  server.listen(CONFIG.printPort, () => {
    log(`[Print] Active on TCP ${CONFIG.printPort}`);
  });
}

// -----------------------------------------------------------------------------
// 6. EPSON ePOS XML SERVERS (HTTP 80 & 8008)
// -----------------------------------------------------------------------------
function startEposHttpServers() {
  CONFIG.eposPorts.forEach((port) => {
    const server = http.createServer((req, res) => {
      if (req.url && req.url.includes('/cgi-bin/epos/service.cgi')) {
        const bodyChunks = [];
        req.on('data', c => bodyChunks.push(c));
        req.on('end', () => {
          const bodyStr = Buffer.concat(bodyChunks).toString('utf8');
          log(`[ePOS] Print request on port ${port} (${bodyStr.length} bytes)`);

          const responseXml =
            '<?xml version="1.0" encoding="utf-8"?>' +
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
            '<s:Body>' +
            '<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="0"/>' +
            '</s:Body>' +
            '</s:Envelope>';

          res.writeHead(200, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(responseXml)
          });
          res.end(responseXml);

          // Handle <image>
          const imgMatch = bodyStr.match(/<image\s+width="(\d+)"\s+height="(\d+)"[^>]*>([\s\S]*?)<\/image>/i);
          if (imgMatch) {
            const widthDots = parseInt(imgMatch[1], 10);
            const heightDots = parseInt(imgMatch[2], 10);
            const base64Data = imgMatch[3].replace(/\s+/g, '');
            const rawRaster = Buffer.from(base64Data, 'base64');
            const lineWidth = Math.ceil(widthDots / 8);

            log(`[ePOS] Image: ${widthDots}x${heightDots} dots (${lineWidth} bytes/row)`);

            const escPosChunks = [
              Buffer.from([0x1B, 0x40]),
              Buffer.from([
                0x1D, 0x76, 0x30, 0x00,
                lineWidth & 0xFF, (lineWidth >> 8) & 0xFF,
                heightDots & 0xFF, (heightDots >> 8) & 0xFF
              ]),
              rawRaster,
              Buffer.from([0x1D, 0x56, 0x41, 0x03]),
              getBeepAlarmCommand()
            ];
            forwardToPrinters(Buffer.concat(escPosChunks));
            return;
          }

          // Handle <text>
          let ticketText = '';
          const textMatches = bodyStr.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi);
          for (const m of textMatches) {
            ticketText += m[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'");
          }

          if (ticketText) {
            log(`[ePOS] Text ticket (${ticketText.length} chars)`);

            // Sync ePOS text order to JKRestaurant POS
            if (CONFIG.settings && CONFIG.settings.syncToJkPos !== false) {
              const textLines = ticketText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
              const orderData = parseReceiptText(textLines);
              if (orderData) {
                pendingOnlineOrders.push(orderData);
                log(`[Queue] Queued ePOS order ${orderData.orderId} (${orderData.platform}: ${orderData.customerName}) for POS delivery!`);
                if (orderData.items && orderData.items.some(it => /pandora/i.test(it.name))) {
                  triggerPandoraLaunch('ePOS Delivery Print');
                }
              }
            }

            const escPosChunks = [
              Buffer.from([0x1B, 0x40]),
              Buffer.from(ticketText, 'ascii'),
              Buffer.from([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x41, 0x03]),
              getBeepAlarmCommand()
            ];
            forwardToPrinters(Buffer.concat(escPosChunks));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(port, () => {
      log(`[ePOS] Active on HTTP port ${port}`);
    });
  });
}

// -----------------------------------------------------------------------------
// 7. ADMIN DASHBOARD & CONFIGURATION API (HTTP 8080)
// -----------------------------------------------------------------------------
function startAdminServer() {
  const publicDir = path.join(__dirname, 'public');

  const server = http.createServer((req, res) => {
    // Enable CORS for browser extension and cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API: POST /api/direct-order (Direct structured JSON order from browser extension)
    if (req.method === 'POST' && req.url === '/api/direct-order') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const orderData = JSON.parse(body);
          log(`[Direct-Order] Received web order ${orderData.orderId} (${orderData.platform}: ${orderData.customerName}) with ${orderData.items ? orderData.items.length : 0} item(s)!`);

          // Prevent duplicate queueing
          const alreadyQueued = pendingOnlineOrders.some(o => o.orderId === orderData.orderId);
          if (!alreadyQueued) {
            pendingOnlineOrders.push(orderData);
            log(`[Direct-Order] Added to POS queue. Total pending: ${pendingOnlineOrders.length}`);

            if (orderData.items && orderData.items.some(it => /pandora/i.test(it.name))) {
              triggerPandoraLaunch('Web Direct Order');
            }

            // Print physical receipt to kitchen & register with beeper alarm
            const ordNumber = (orderData.orderId || '').replace(/[^0-9]/g, '').slice(-3) || '1';
            const timeStr = new Date().toLocaleTimeString();

            const buffers = [
              Buffer.from([0x1B, 0x40]), // ESC @ Initialize
              Buffer.from([0x1B, 0x61, 0x01]), // Center align
              Buffer.from([0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01]), // Double size + Bold
              Buffer.from(`*** ${(orderData.platform || 'UBER EATS').toUpperCase()} ***\n`),
              Buffer.from([0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]), // Normal
              Buffer.from(`REF: ${orderData.orderId}\n`),
              Buffer.from(`Customer: ${orderData.customerName}\n`),
              Buffer.from(`Time: ${timeStr}\n`),
              Buffer.from('------------------------------------------\n'),
              Buffer.from([0x1B, 0x61, 0x00]) // Left align
            ];

            if (orderData.items && orderData.items.length > 0) {
              for (const it of orderData.items) {
                buffers.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold
                buffers.push(Buffer.from(`${it.qty || 1}x ${it.name}\n`));
                buffers.push(Buffer.from([0x1B, 0x45, 0x00])); // Normal
                if (it.notes) {
                  buffers.push(Buffer.from(`   * ${it.notes}\n`));
                }
              }
            }

            buffers.push(Buffer.from('------------------------------------------\n'));
            buffers.push(Buffer.from([0x1B, 0x61, 0x01])); // Center
            buffers.push(Buffer.from('TOTAL: $0.00 (Prepaid)\n'));
            buffers.push(Buffer.from('>>> SYNCED TO POS SCREEN <<<\n\n\n\n'));
            buffers.push(Buffer.from([0x1D, 0x56, 0x41, 0x03])); // Cut
            buffers.push(getBeepAlarmCommand()); // 5 loud kitchen beeps

            forwardToPrinters(Buffer.concat(buffers));
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Order received and processed' }));
        } catch (e) {
          log(`[Direct-Order Error] ${e.message}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // API: JKSoft Native POS Online Order Polling & Confirmation Endpoint
    if (req.url && req.url.includes('/api/jksoft')) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        log(`[JKSoft-Poll] Received POS Online Order query (${req.method} ${req.url})`);

        // Check for ConfirmOrder
        if (body.includes('<ConfirmOrder>') || req.url.includes('confirm_order')) {
          log(`[JKSoft-POS] POS confirmed receipt of online order!`);
          if (pendingOnlineOrders.length > 0) {
            pendingOnlineOrders.shift(); // Remove confirmed order
          }
          const confirmXml = '<?xml version="1.0" encoding="UTF-8"?><ConfirmOrderResponse><ResultCode>0</ResultCode></ConfirmOrderResponse>';
          res.writeHead(200, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(confirmXml)
          });
          res.end(confirmXml);
          return;
        }

        // Return next pending order if available
        let responseXml = '';
        if (pendingOnlineOrders.length > 0) {
          const nextOrder = pendingOnlineOrders[0];
          log(`[JKSoft-POS] Delivering order ${nextOrder.orderId} (${nextOrder.platform}) to POS screen!`);
          responseXml = buildJkOnlineOrderXml(nextOrder);
        } else {
          responseXml = '<?xml version="1.0" encoding="UTF-8"?><GetNewOrdersResponse><ResultCode>0</ResultCode><TotalRecords>0</TotalRecords></GetNewOrdersResponse>';
        }

        res.writeHead(200, {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(responseXml)
        });
        res.end(responseXml);
      });
      return;
    }

    // API: POST /api/queue-test-order (Trigger live test order to POS & printers)
    if (req.method === 'POST' && req.url === '/api/queue-test-order') {
      const testOrder = {
        platform: 'Uber Eats',
        orderId: 'UBR-' + Math.floor(1000 + Math.random() * 9000),
        customerName: 'UBER TEST ORDER',
        subtotal: 0,
        tax: 0,
        total: 0,
        items: [
          { qty: 1, name: 'Crack Pepper Turkey', notes: 'Toasted, Extra Mayo', price: 0 },
          { qty: 1, name: 'Potato Salad', notes: '', price: 0 }
        ]
      };

      // Queue for native POS pop-up
      pendingOnlineOrders.push(testOrder);
      log(`[Queue] Added test order ${testOrder.orderId} to POS queue! (${pendingOnlineOrders.length} pending)`);

      // Print test slip to kitchen & register
      const slip = Buffer.concat([
        Buffer.from([0x1B, 0x40]),
        Buffer.from([0x1B, 0x61, 0x01, 0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01]),
        Buffer.from('*** UBER EATS TEST ***\n'),
        Buffer.from([0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]),
        Buffer.from(`Ref: ${testOrder.orderId}\n`),
        Buffer.from(`Customer: ${testOrder.customerName}\n`),
        Buffer.from(`Time: ${new Date().toLocaleTimeString()}\n`),
        Buffer.from('------------------------------------------\n'),
        Buffer.from([0x1B, 0x61, 0x00, 0x1B, 0x45, 0x01]),
        Buffer.from('1x Crack Pepper Turkey\n'),
        Buffer.from([0x1B, 0x45, 0x00]),
        Buffer.from('   * Toasted, Extra Mayo\n'),
        Buffer.from([0x1B, 0x45, 0x01]),
        Buffer.from('1x Potato Salad\n'),
        Buffer.from([0x1B, 0x45, 0x00]),
        Buffer.from('------------------------------------------\n'),
        Buffer.from([0x1B, 0x61, 0x01]),
        Buffer.from('TOTAL: $0.00 (Prepaid)\n'),
        Buffer.from('>>> SYNCED TO POS SCREEN <<<\n\n\n\n'),
        Buffer.from([0x1D, 0x56, 0x41, 0x03]),
        getBeepAlarmCommand()
      ]);
      forwardToPrinters(slip);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Test order queued for POS screen and printed' }));
      return;
    }

    // API: GET /api/config
    if (req.method === 'GET' && req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ targetPrinters: CONFIG.targetPrinters, settings: CONFIG.settings }));
      return;
    }

    // API: POST /api/config
    if (req.method === 'POST' && req.url === '/api/config') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const newConfig = JSON.parse(body);
          if (newConfig.targetPrinters) CONFIG.targetPrinters = newConfig.targetPrinters;
          if (newConfig.settings) CONFIG.settings = Object.assign(CONFIG.settings, newConfig.settings);

          // Save to config.json
          fs.writeFileSync(CONFIG_FILE, JSON.stringify({
            targetPrinters: CONFIG.targetPrinters,
            settings: CONFIG.settings
          }, null, 2), 'utf8');

          log(`[Admin] Configuration updated via dashboard`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Settings saved successfully' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // API: POST /api/test-print
    if (req.method === 'POST' && req.url === '/api/test-print') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const reqData = JSON.parse(body || '{}');
          const printerId = reqData.printerId;

          // Build test slip
          const slip = Buffer.concat([
            Buffer.from([0x1B, 0x40]), // ESC @
            Buffer.from([0x1B, 0x61, 0x01, 0x1B, 0x45, 0x01, 0x1D, 0x21, 0x11]),
            Buffer.from('*** TEST PRINT ***\n'),
            Buffer.from([0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]),
            Buffer.from(`Time: ${new Date().toLocaleTimeString()}\nCopies: ${CONFIG.settings.copies} | Beeps: ${CONFIG.settings.beeps}\n\n\n`),
            Buffer.from([0x1D, 0x56, 0x41, 0x03]), // Cut
            getBeepAlarmCommand()
          ]);

          if (printerId && printerId !== 'all') {
            const target = CONFIG.targetPrinters.find(p => p.id === printerId || p.name === printerId);
            if (target) {
              const copies = Math.max(1, CONFIG.settings.copies || 1);
              for (let i = 0; i < copies; i++) {
                if (target.smbPath) {
                  fs.writeFile(target.smbPath, slip, () => {});
                } else if (target.ip && target.port) {
                  const client = new net.Socket();
                  client.connect(target.port, target.ip, () => {
                    client.write(slip, () => client.end());
                  });
                }
              }
            }
          } else {
            forwardToPrinters(slip);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Test print sent' }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // Static Files
    let filePath = path.join(publicDir, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        res.end(content);
      }
    });
  });

  server.on('error', (err) => {
    log(`[Admin Server Error] ${err.message}`);
  });

  server.listen(CONFIG.adminPort, () => {
    log(`[Admin] Dashboard server active on http://localhost:${CONFIG.adminPort}`);
  });
}

// -----------------------------------------------------------------------------
// START SERVICES
// -----------------------------------------------------------------------------
log('========================================================');
log('Starting Delivery POS Bridge v2.1 (Normalized 576-dot)...');
log(`Host: ${CONFIG.localIp} | Target: ${CONFIG.targetPrinters.map(p => p.name + ' (' + (p.ip || p.smbPath) + ')').join(', ')}`);
log('========================================================');

startDiscoveryServer();
startStatusServer();
startPrintServer();
startEposHttpServers();
startAdminServer();

// -----------------------------------------------------------------------------
// PANDORA ROKU TV AUTO-LAUNCHER (192.168.2.225)
// Watches MS SQL tItem for any order with "Pandora" added at the POS register
// -----------------------------------------------------------------------------
let lastSeenItemIdn = 0;

async function checkNewItemsForPandora() {
  try {
    const { getPool, sql } = require('C:/Users/Dunesuser/jkrestaurant-web/backend/db');
    const pool = await getPool();

    if (!lastSeenItemIdn) {
      const initRes = await pool.request().query('SELECT ISNULL(MAX(ItemIDN), 0) as maxIdn FROM tItem');
      lastSeenItemIdn = Number(initRes.recordset[0].maxIdn);
      return;
    }

    const res = await pool.request()
      .input('lastId', sql.Money, lastSeenItemIdn)
      .query(`
        SELECT TOP 5 ItemIDN, Summary, Memo
        FROM tItem
        WHERE ItemIDN > @lastId
          AND (Summary LIKE '%Pandora%' OR Memo LIKE '%Pandora%')
        ORDER BY ItemIDN DESC
      `);

    if (res.recordset.length > 0) {
      log(`[Roku] Detected Pandora item added to POS order! (ItemIDN: ${res.recordset[0].ItemIDN})`);
      triggerPandoraLaunch('POS Register Order');
    }

    // Update watermark
    const currentMaxRes = await pool.request().query('SELECT ISNULL(MAX(ItemIDN), 0) as maxIdn FROM tItem');
    lastSeenItemIdn = Number(currentMaxRes.recordset[0].maxIdn);
  } catch (err) {}
}

setInterval(checkNewItemsForPandora, 2500);

