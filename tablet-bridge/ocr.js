const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PS_SCRIPT = path.join(__dirname, 'run_ocr.ps1');

// PowerShell script that uses Windows native OCR
const PS_CODE = `
param([string]$ImagePath)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation.Metadata, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.Metadata, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Foundation.Metadata, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($asyncOp, $type) {
    $asTask = $asTaskGeneric.MakeGenericMethod($type)
    $task = $asTask.Invoke($null, @($asyncOp))
    $task.Wait()
    return $task.Result
}

$fileItem = Get-Item $ImagePath
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($fileItem.FullName)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$softwareBitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$lang = [Windows.Globalization.Language]::new('en-US')
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
$result = Await ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])

$lines = @()
foreach ($l in $result.Lines) {
    $lines += $l.Text
}
$lines | ConvertTo-Json -Compress
`;

if (!fs.existsSync(PS_SCRIPT)) {
  fs.writeFileSync(PS_SCRIPT, PS_CODE, 'utf8');
}

/**
 * Build 1-bit monochrome BMP buffer from 72-byte (576-dot) raster lines
 */
function createBmpBuffer(rasterLines) {
  const width = 576;
  const height = rasterLines.length;
  const rowBytes = 72; // (576 + 31) / 32 * 4

  const fileSize = 14 + 40 + 8 + (rowBytes * height);
  const buf = Buffer.alloc(fileSize);

  // 1. BMP Header (14 bytes)
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6); // reserved
  buf.writeUInt32LE(14 + 40 + 8, 10); // pixel data offset

  // 2. DIB Header / BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, 14); // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(1, 28); // 1 bit per pixel
  buf.writeUInt32LE(0, 30); // compression BI_RGB
  buf.writeUInt32LE(rowBytes * height, 34); // image size
  buf.writeInt32LE(2835, 38); // 72 DPI
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(2, 46); // 2 colors in palette
  buf.writeUInt32LE(2, 50);

  // 3. Color Palette (8 bytes)
  // Index 0: White (0xFFFFFF00)
  buf[54] = 0xFF; buf[55] = 0xFF; buf[56] = 0xFF; buf[57] = 0x00;
  // Index 1: Black (0x00000000)
  buf[58] = 0x00; buf[59] = 0x00; buf[60] = 0x00; buf[61] = 0x00;

  // 4. Pixel Rows (Bottom-up order)
  let offset = 62;
  for (let i = height - 1; i >= 0; i--) {
    rasterLines[i].copy(buf, offset, 0, rowBytes);
    offset += rowBytes;
  }

  return buf;
}

/**
 * Run OCR on raster lines and return extracted text lines
 */
function recognizeRasterLines(rasterLines) {
  return new Promise((resolve) => {
    if (!rasterLines || rasterLines.length < 50) {
      return resolve([]);
    }

    const bmpBuf = createBmpBuffer(rasterLines);
    const tempBmp = path.join(__dirname, `temp_ocr_${Date.now()}.bmp`);

    fs.writeFile(tempBmp, bmpBuf, (err) => {
      if (err) return resolve([]);

      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-ImagePath', tempBmp], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        try { fs.unlinkSync(tempBmp); } catch (e) {}
        if (error || !stdout) {
          return resolve([]);
        }

        try {
          const lines = JSON.parse(stdout.trim());
          resolve(Array.isArray(lines) ? lines : [lines]);
        } catch (e) {
          const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          resolve(lines);
        }
      });
    });
  });
}

module.exports = {
  createBmpBuffer,
  recognizeRasterLines
};
