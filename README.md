# JKRestaurant POS Web Management Suite

A full-stack web and mobile application designed for **JKRestaurant** connecting directly to the live **Microsoft SQL Server** database (`DUNESSERVER\JKSOFT`) and local network kitchen printers.

---

## 🚀 Quick Start

### Option 1: Desktop Shortcut
Double-click the **`JKRestaurant Web Client.bat`** file located on your **Desktop**.
This automatically:
1. Starts the background Node.js MS SQL API & Kitchen Printing service.
2. Opens your browser to **`http://localhost:5000`**.

### Option 2: Mobile / Tablet Access on Local Wi-Fi
Open Safari (iPad/iPhone) or Chrome (Android Tablet/Phone) connected to the restaurant Wi-Fi and navigate to:
👉 **`http://<SERVER_IP>:5000`** (e.g. `http://192.168.2.229:5000`)

---

## 🔒 Master Credentials & Security

The entire application (Web POS, ordering, management, and utilities) is secured behind master authentication:

- **Default Username:** `admin`
- **Default Password:** `dunes2026`

*(To customize the credentials, edit `backend/config.js` or set `AUTH_USER` and `AUTH_PASSWORD` in your environment).*

- **App-Wide Protection:** All `/api/*` endpoints are guarded by native HMAC-SHA256 tokens. Unauthenticated requests are immediately blocked with `401 Unauthorized`.
- **Session Persistence:** Staying logged in preserves your token in `localStorage`.
- **One-Click Logout:** Click **"🔒 Lock / Sign Out"** in the top navigation bar at any time to immediately lock the terminal.

---

## 🛠️ Architecture & Tech Stack

- **Database:** Microsoft SQL Server 2008/2012+ (`DUNESSERVER\JKSOFT`)
  - **Transactional Database:** `JKRTDB` (Tables: `rItem`, `rCategory`, `tInvoice`, `tItem`, `tPayment`)
- **Backend API:** Node.js + Express + `mssql` native connection pooling
- **Kitchen Printing Engine:** ESC/POS raw TCP socket (port 9100) with automatic Windows Spooler fallback:
  - **Hot Kitchen:** `192.168.2.246:9100` (`POS-80C(hot)`)
  - **Cold Kitchen:** `192.168.2.146:9100` (`POS-80C(cold)`)
- **Frontend:** React 18 + Vite + Vanilla CSS (Touch-optimized for tablets, iPads, and smartphones)

---

## 🌟 Key Features

### 1. 📱 Mobile / Tablet POS Order Entry (`Take Orders`)
- **Touch-Optimized Menu Catalog:** Large, responsive cards designed for quick tapping on tablets and phones.
- **Category Filter Pills:** Rapidly switch between 28 categories (Breakfast, Custom Sandwiches, Beverages, Panini, Salads, etc.).
- **Item Search:** Fast search bar for finding any dish in seconds.
- **Table & Tab Management:**
  - Open a new table number or guest tab name.
  - View currently occupied tables and add items to existing checks.
- **Custom Modifiers & Kitchen Instructions:**
  - Tap any item to add quick instructions (`NO ONION`, `EXTRA CHEESE`, `WELL DONE`, `DRESSING ON SIDE`, `TOASTED`).
- **One-Tap "SEND TO KITCHEN":**
  - Saves the order directly into MS SQL (`tInvoice` and `tItem`).
  - Automatically routes hot items to the **Hot Kitchen Printer** (`POS-80C(hot)`) and cold items to the **Cold Kitchen Printer** (`POS-80C(cold)`).
  - Indents special notes and cuts the thermal ticket automatically.

### 2. 🖨️ Direct Kitchen Printing & Diagnostics
- **Network Thermal Printing:** Uses direct ESC/POS byte streaming to port 9100.
- **Automatic Fallback:** If network socket is interrupted, automatically spools via Windows Print Spooler.
- **Test Print Buttons:** Dedicated buttons in the POS header to test the Hot and Cold printers on demand.

### 3. 📊 Real-Time Dashboard & POS KPIs
- **Live Health Status:** Instant visual connection badge to `DUNESSERVER\JKSOFT`.
- **Live Metrics:** Active Menu Items, Today's Order Count, Lifetime Sales Revenue.
- **Live POS Feed:** Stream of recent transactions.

### 4. 📋 Menu & 86/Sold-Out Manager
- **Live Price Editing:** In-line modal updating `rItem.Price` in MS SQL Server immediately.
- **One-Click 86/Sold Out Toggle:** Toggles availability of items in real time.

### 5. 🧾 Orders & Itemized POS Receipts
- **Check Breakdown:** Review itemized customer checks formatted like a deli guest receipt with taxes, discounts, and payment tenders.

---

## 🛵 Delivery Tablet Bridge (Uber Eats & Grubhub)

The suite includes a native background bridge service (`tablet-bridge/`) that allows Android tablets running **Uber Eats Orders** and **Grubhub for Restaurants** to discover and print directly to standard **Xprinter XP-K200L (POS-80C)** thermal printers.

### Hardware Mappings
- **Deli Station:** `192.168.2.153:9100` (Raw ESC/POS TCP)
- **Kitchen / Grill Station:** `192.168.2.246:9100` (Raw ESC/POS TCP)
- **Register / Expedite Station:** `\\192.168.2.232\POS-80C` (SMB Shared Spooler on `DUNESSERVER`)

### Key Features
1. **StarPRNT & Epson ePOS Emulation:**
   - Responds to StarIO UDP 22222 broadcast discovery as `TSP143IIILAN (STR_T-001)`.
   - Answers StarIO TCP 9101 status polling and acknowledges ETB markers (`0x17`) in real time.
   - Listens on HTTP ports 80 & 8008 for Epson ePOS XML print requests.
2. **576-Dot Normalized Raster Translation:**
   - Translates StarPRNT variable raster rows and blank skips (`ESC * r Y`) into 72-byte (576-dot) aligned ESC/POS (`GS v 0`) bitmap blocks. Eliminates diagonal distortion.
3. **Kitchen Audio Alarm:**
   - Sends a loud 5-beep kitchen audio sequence (`ESC B 5 4`) + chime (`BEL`) + cash drawer pulses on every ticket cut.
4. **Native POS Online Order Sync:**
   - Uses Windows native OCR (`Windows.Media.Ocr`) to extract customer name, order number, line items, and modifiers.
   - Serves incoming orders to `JKRestaurant.exe` via its native Online Order polling protocol (`/api/jksoft/checkorder`) at **$0.00 prices** (prepaid).
   - Orders pop up directly on the POS register under **Take Out / Pick Up**.
5. **Printer Control Dashboard (`http://localhost:8080`):**
   - Toggle printer stations ON/OFF with live sync.
   - Adjust copy counts (1–5) and kitchen beep counts (0–9).
   - Test print individual stations or all active printers with one click.

