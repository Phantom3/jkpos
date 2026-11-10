/**
 * Headless Delivery Order Sync Service
 * Runs Microsoft Edge headlessly in the background without any visible windows.
 * Continuously captures live orders from Uber Eats & Grubhub via the browser extension.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE_DIR = 'C:\\Users\\Dunesuser\\AppData\\Local\\HeadlessDeliveryProfile';
const EXTENSION_DIR = 'C:\\Users\\Dunesuser\\jkrestaurant-web\\browser-extension';

const UBER_URL = 'https://merchants-beta.ubereats.com/orders/overview';
const GRUBHUB_URL = 'https://restaurant.grubhub.com';

let edgeProcess = null;
let restartAttempts = 0;

function log(msg) {
  console.log(`[Headless-Sync ${new Date().toISOString()}] ${msg}`);
}

function startHeadlessBrowser() {
  if (!fs.existsSync(EDGE_PATH)) {
    log(`ERROR: Microsoft Edge not found at ${EDGE_PATH}`);
    return;
  }

  log('Starting Microsoft Edge in 100% invisible headless mode...');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9222',
    `--user-data-dir=${PROFILE_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    UBER_URL,
    GRUBHUB_URL
  ];

  edgeProcess = spawn(EDGE_PATH, args, {
    detached: true,
    stdio: 'ignore'
  });

  log(`Headless Edge launched (PID: ${edgeProcess.pid})`);

  edgeProcess.on('exit', (code, signal) => {
    log(`Headless Edge exited (code: ${code}, signal: ${signal}).`);
    edgeProcess = null;
    restartAttempts++;
    if (restartAttempts < 50) {
      log('Restarting headless browser in 5 seconds...');
      setTimeout(startHeadlessBrowser, 5000);
    } else {
      log('Max restart attempts reached.');
    }
  });

  edgeProcess.on('error', (err) => {
    log(`Headless Edge error: ${err.message}`);
  });
}

function stopHeadlessBrowser() {
  if (edgeProcess) {
    try {
      process.kill(edgeProcess.pid);
    } catch (e) {}
    edgeProcess = null;
  }
}

process.on('SIGINT', () => {
  stopHeadlessBrowser();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopHeadlessBrowser();
  process.exit(0);
});

startHeadlessBrowser();

module.exports = {
  startHeadlessBrowser,
  stopHeadlessBrowser
};
