let currentConfig = {
  targetPrinters: [],
  settings: {
    copies: 1,
    beeps: 5
  }
};

// DOM Elements
const printersListEl = document.getElementById('printers-list');
const copiesInput = document.getElementById('copies-input');
const beepsInput = document.getElementById('beeps-input');
const syncPosToggle = document.getElementById('sync-pos-toggle');
const btnSave = document.getElementById('btn-save');
const btnTestAll = document.getElementById('btn-test-all');
const toastEl = document.getElementById('toast');

// Fetch initial configuration
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    currentConfig = data;
    renderPrinters();
    renderSettings();
  } catch (err) {
    showToast('Failed to load configuration', true);
  }
}

// Render dynamic printers
function renderPrinters() {
  printersListEl.innerHTML = '';

  if (!currentConfig.targetPrinters || currentConfig.targetPrinters.length === 0) {
    printersListEl.innerHTML = '<div style="color: var(--text-muted); padding: 12px;">No printers configured</div>';
    return;
  }

  currentConfig.targetPrinters.forEach((printer, index) => {
    const item = document.createElement('div');
    item.className = `printer-item ${printer.enabled ? 'active' : ''}`;
    item.innerHTML = `
      <div class="printer-details">
        <span class="printer-name">${printer.name}</span>
        <span class="printer-target">${printer.ip ? `${printer.ip}:${printer.port}` : printer.smbPath}</span>
      </div>
      <div class="printer-actions">
        <button class="btn-test-single" onclick="testPrinter('${printer.id || printer.name}')">Test Print</button>
        <label class="switch">
          <input type="checkbox" ${printer.enabled ? 'checked' : ''} onchange="togglePrinter(${index})">
          <span class="slider"></span>
        </label>
      </div>
    `;
    printersListEl.appendChild(item);
  });
}

// Render settings form
function renderSettings() {
  if (currentConfig.settings) {
    copiesInput.value = currentConfig.settings.copies || 1;
    beepsInput.value = typeof currentConfig.settings.beeps === 'number' ? currentConfig.settings.beeps : 3;
    if (syncPosToggle) {
      syncPosToggle.checked = currentConfig.settings.syncToJkPos !== false;
    }
  }
}

// Toggle printer active status
function togglePrinter(index) {
  currentConfig.targetPrinters[index].enabled = !currentConfig.targetPrinters[index].enabled;
  renderPrinters();
}

// Adjust Stepper Values
function adjustValue(field, delta) {
  if (field === 'copies') {
    let val = parseInt(copiesInput.value, 10) + delta;
    if (val < 1) val = 1;
    if (val > 5) val = 5;
    copiesInput.value = val;
  } else if (field === 'beeps') {
    let val = parseInt(beepsInput.value, 10) + delta;
    if (val < 0) val = 0;
    if (val > 9) val = 9;
    beepsInput.value = val;
  }
}

// Save Settings to Backend
async function saveConfig() {
  currentConfig.settings.copies = parseInt(copiesInput.value, 10) || 1;
  currentConfig.settings.beeps = parseInt(beepsInput.value, 10) || 0;
  if (syncPosToggle) {
    currentConfig.settings.syncToJkPos = syncPosToggle.checked;
  }

  btnSave.disabled = true;
  btnSave.innerText = 'Saving...';

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentConfig)
    });

    const result = await res.json();
    if (result.success) {
      showToast('Settings saved & active live!');
    } else {
      showToast('Error: ' + result.error, true);
    }
  } catch (err) {
    showToast('Failed to connect to bridge server', true);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<span class="icon">💾</span> Save Changes';
  }
}

// Trigger Test Print
async function testPrinter(printerId) {
  showToast(`Sending test to ${printerId === 'all' ? 'all active printers' : printerId}...`);
  try {
    const res = await fetch('/api/test-print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerId })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Test print dispatched!');
    } else {
      showToast('Test failed: ' + result.error, true);
    }
  } catch (err) {
    showToast('Failed to reach bridge server', true);
  }
}

// Toast notification helper
function showToast(message, isError = false) {
  toastEl.innerText = message;
  toastEl.style.backgroundColor = isError ? 'var(--danger)' : 'var(--success)';
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

// Event Listeners
btnSave.addEventListener('click', saveConfig);
btnTestAll.addEventListener('click', () => testPrinter('all'));

// Initial Load
fetchConfig();
