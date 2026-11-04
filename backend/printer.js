const net = require('net');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const KITCHEN_PRINTERS = {
    1: { id: 1, name: 'Kitchen', ip: '192.168.2.246', port: 9100, windowsPrinter: 'POS-80C(hot)' },
    2: { id: 2, name: 'Deli', ip: '192.168.2.153', port: 9100, windowsPrinter: 'POS-80C(cold)' },
    3: { id: 3, name: 'Register', smbPath: '\\\\192.168.2.232\\POS-80C', windowsPrinter: 'POS-80C(register)' }
};

// Standard ESC/POS Commands
const CMD = {
    INIT: Buffer.from([0x1B, 0x40]),               // Initialize printer
    ALIGN_LEFT: Buffer.from([0x1B, 0x61, 0x00]),   // Left align
    ALIGN_CENTER: Buffer.from([0x1B, 0x61, 0x01]), // Center align
    ALIGN_RIGHT: Buffer.from([0x1B, 0x61, 0x02]),  // Right align
    BOLD_ON: Buffer.from([0x1B, 0x45, 0x01]),      // Bold on
    BOLD_OFF: Buffer.from([0x1B, 0x45, 0x00]),     // Bold off
    TEXT_NORMAL: Buffer.from([0x1D, 0x21, 0x00]),  // Normal size
    TEXT_LARGE: Buffer.from([0x1D, 0x21, 0x11]),   // 2x height & width
    TEXT_DOUBLE_H: Buffer.from([0x1D, 0x21, 0x01]),// 2x height
    FEED_CUT: Buffer.from([0x1B, 0x64, 0x05, 0x1D, 0x56, 0x41, 0x03]), // Feed 5 lines & partial cut
    BEEP: Buffer.from([0x1B, 0x42, 0x02, 0x02])    // 2 short beeps
};

/**
 * Send raw buffer to printer via TCP socket with Windows Spooler fallback
 */
function sendToPrinter(printerConfig, buffer) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let connected = false;
        client.setTimeout(2500);

        client.connect(printerConfig.port, printerConfig.ip, () => {
            connected = true;
            client.write(buffer, () => {
                client.end();
                resolve({ success: true, method: 'tcp', printer: printerConfig.name });
            });
        });

        client.on('error', (err) => {
            client.destroy();
            console.warn(`[Printer] TCP failed for ${printerConfig.name} (${printerConfig.ip}): ${err.message}. Trying Windows Spooler fallback...`);
            
            // Fallback: Windows Print Spooler
            fallbackWindowsPrint(printerConfig.windowsPrinter, buffer)
                .then(resolve)
                .catch(reject);
        });

        client.on('timeout', () => {
            client.destroy();
            if (!connected) {
                console.warn(`[Printer] Timeout connecting to ${printerConfig.name} (${printerConfig.ip}). Trying Windows Spooler fallback...`);
                fallbackWindowsPrint(printerConfig.windowsPrinter, buffer)
                    .then(resolve)
                    .catch(reject);
            }
        });
    });
}

/**
 * Fallback to print via Windows Spooler
 */
function fallbackWindowsPrint(printerName, buffer) {
    return new Promise((resolve, reject) => {
        try {
            const tempFile = path.join(__dirname, `temp_print_${Date.now()}.bin`);
            fs.writeFileSync(tempFile, buffer);

            const psCommand = `powershell -NoProfile -Command "Get-Content -Path '${tempFile}' -Encoding Byte -Raw | Out-Printer -Name '${printerName}'"`;
            exec(psCommand, (error) => {
                try { fs.unlinkSync(tempFile); } catch (e) {}
                if (error) {
                    console.error(`[Printer] Windows Spooler failed for ${printerName}:`, error);
                    reject(error);
                } else {
                    resolve({ success: true, method: 'spooler', printer: printerName });
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Format a kitchen ticket for a specific printer
 */
function formatKitchenTicket({ orderNum, invoiceNumber, tableNum, guestName, serverName, date, items, kitchenName }) {
    const buffers = [];

    buffers.push(CMD.INIT);
    buffers.push(CMD.BEEP);

    // Header
    buffers.push(CMD.ALIGN_CENTER);
    buffers.push(CMD.BOLD_ON);
    buffers.push(CMD.TEXT_LARGE);
    buffers.push(Buffer.from(`*** ${kitchenName.toUpperCase()} ***\n`));
    buffers.push(CMD.TEXT_NORMAL);
    buffers.push(Buffer.from("================================\n"));

    // Meta details
    buffers.push(CMD.ALIGN_LEFT);
    const tableStr = tableNum ? `TABLE: ${tableNum}` : 'COUNTER / TAB';
    const orderStr = orderNum ? `ORDER: #${orderNum}` : `INV: #${invoiceNumber}`;
    buffers.push(CMD.BOLD_ON);
    buffers.push(CMD.TEXT_DOUBLE_H);
    buffers.push(Buffer.from(`${tableStr.padEnd(16)} ${orderStr}\n`));
    buffers.push(CMD.TEXT_NORMAL);
    buffers.push(CMD.BOLD_OFF);

    if (guestName) {
        buffers.push(Buffer.from(`GUEST / TAB: ${guestName}\n`));
    }
    const dateFormatted = date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString();
    buffers.push(Buffer.from(`SERVER: ${serverName || 'TABLET'}     TIME: ${dateFormatted}\n`));
    buffers.push(Buffer.from("--------------------------------\n"));

    // Items list
    buffers.push(CMD.BOLD_ON);
    buffers.push(CMD.TEXT_DOUBLE_H);
    for (const item of items) {
        const qty = item.qty || item.Qty || 1;
        const name = item.name || item.ItemName || item.Name || 'Item';
        buffers.push(Buffer.from(`${qty}x  ${name}\n`));

        // Modifiers / Notes
        const notes = item.notes || item.Memo || '';
        if (notes && typeof notes === 'string') {
            buffers.push(CMD.TEXT_NORMAL);
            buffers.push(CMD.BOLD_OFF);
            const noteLines = notes.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
            for (const n of noteLines) {
                buffers.push(Buffer.from(`    * ${n}\n`));
            }
            buffers.push(CMD.BOLD_ON);
            buffers.push(CMD.TEXT_DOUBLE_H);
        }
    }

    buffers.push(CMD.TEXT_NORMAL);
    buffers.push(CMD.BOLD_OFF);
    buffers.push(CMD.ALIGN_CENTER);
    buffers.push(Buffer.from("================================\n\n\n"));
    buffers.push(CMD.FEED_CUT);

    return Buffer.concat(buffers);
}

/**
 * Print kitchen ticket for an order.
 * Routes items to their assigned kitchen printer (Hot vs Cold).
 */
async function printOrderToKitchen({ orderNum, invoiceNumber, tableNum, guestName, serverName, date, items }) {
    // Separate items by printer: 1 (Hot), 2 (Cold)
    // Default to printer 1 if unassigned
    const hotItems = [];
    const coldItems = [];

    for (const item of items) {
        const printerNum = item.KitchenPrinterNum || item.kitchenPrinterNum || 1;
        if (printerNum === 2) {
            coldItems.push(item);
        } else {
            hotItems.push(item);
        }
    }

    const results = [];

    // Print to Kitchen if items exist
    if (hotItems.length > 0) {
        const hotTicket = formatKitchenTicket({
            orderNum,
            invoiceNumber,
            tableNum,
            guestName,
            serverName,
            date,
            items: hotItems,
            kitchenName: 'KITCHEN'
        });
        try {
            const res = await sendToPrinter(KITCHEN_PRINTERS[1], hotTicket);
            results.push({ printer: 'KITCHEN', status: 'printed', details: res });
        } catch (err) {
            console.error('[Printer] Kitchen error:', err);
            results.push({ printer: 'KITCHEN', status: 'error', error: err.message });
        }
    }

    // Print to Deli if items exist
    if (coldItems.length > 0) {
        const coldTicket = formatKitchenTicket({
            orderNum,
            invoiceNumber,
            tableNum,
            guestName,
            serverName,
            date,
            items: coldItems,
            kitchenName: 'DELI'
        });
        try {
            const res = await sendToPrinter(KITCHEN_PRINTERS[2], coldTicket);
            results.push({ printer: 'DELI', status: 'printed', details: res });
        } catch (err) {
            console.error('[Printer] Deli error:', err);
            results.push({ printer: 'DELI', status: 'error', error: err.message });
        }
    }

    return results;
}

module.exports = {
    KITCHEN_PRINTERS,
    printOrderToKitchen,
    formatKitchenTicket,
    sendToPrinter
};
