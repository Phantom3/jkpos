/**
 * Roku TV Pandora Launcher for 192.168.2.225
 * Uses Roku External Control Protocol (ECP) on port 8060
 */

const http = require('http');

const ROKU_IP = '192.168.2.225';
const PANDORA_APP_ID = '28';

function sendRokuCommand(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: ROKU_IP,
      port: 8060,
      path: path,
      method: 'POST'
    }, res => {
      resolve(res.statusCode);
    });
    req.on('error', err => reject(err));
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Roku command timeout'));
    });
    req.end();
  });
}

let lastTriggerTime = 0;

async function triggerPandoraLaunch(source = 'Order') {
  // Cooldown of 15 seconds to prevent spam
  if (Date.now() - lastTriggerTime < 15000) {
    console.log(`[Roku] Pandora trigger on cooldown (last fired ${Math.round((Date.now() - lastTriggerTime) / 1000)}s ago)`);
    return;
  }
  lastTriggerTime = Date.now();

  console.log(`[Roku] Pandora item detected via ${source}! Launching on Roku TV (${ROKU_IP})...`);
  try {
    // 1. Wake up TV
    await sendRokuCommand('/keypress/PowerOn');

    // 2. Launch Pandora (App ID 28)
    setTimeout(async () => {
      try {
        await sendRokuCommand(`/launch/${PANDORA_APP_ID}`);
        console.log(`[Roku] Launched Pandora app successfully!`);

        // 3. Wait 8 seconds for station menu to load, then send Select / Play
        setTimeout(async () => {
          try {
            await sendRokuCommand('/keypress/Select');
            await sendRokuCommand('/keypress/Play');
            console.log(`[Roku] Sent Select and Play to begin playback!`);
          } catch (e) {}
        }, 8000);
      } catch (err) {
        console.error(`[Roku] Launch error: ${err.message}`);
      }
    }, 1500);
  } catch (err) {
    console.error(`[Roku] PowerOn error: ${err.message}`);
  }
}

module.exports = {
  triggerPandoraLaunch,
  sendRokuCommand
};
