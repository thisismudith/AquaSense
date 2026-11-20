<div align="center">

# 💧 SipSure

**Field water-quality testing on Android: offline, guided and traceable.**

Companion app for the SipSure handheld photometric analyser. It measures
**Cr(VI)**, **nitrite (NO₂⁻)**, **free chlorine (Cl₂)** and **lead (Pb)**.

[![Platform](https://img.shields.io/badge/platform-Android%207.0%2B-3DDC84?logo=android&logoColor=white)](#-install)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-54-000020?logo=expo)](https://docs.expo.dev/)
[![Offline](https://img.shields.io/badge/works-100%25%20offline-0E7C7B)](#-why-sipsure)
[![Release](https://img.shields.io/badge/release-v0.1.0-blue)](../../releases/latest)

[**Download APK**](../../releases/latest) · [How to use](#-how-to-use) · [Features](#-features)

</div>

---

## 📑 Table of contents

- [What is SipSure?](#-what-is-sipsure)
- [Why SipSure?](#-why-sipsure)
- [Features](#-features)
- [Install](#-install)
- [How to use](#-how-to-use)
- [Connecting the analyser](#-connecting-the-analyser)
- [Project status](#-project-status)
- [For developers](#-for-developers)

## 🔬 What is SipSure?

SipSure pairs an **ESP32-based handheld photometer** with this Android app. The analyser measures the
absorbance of a reacted water sample. The app guides the technician through the test, then stores the
result with its photo, location and reagent batch. It also produces reports.

Everything stays **on the phone**. There is no account, no server and no internet connection.

## 💡 Why SipSure?

| Problem in the field | How SipSure helps |
|---|---|
| Paper logs get lost and are hard to audit | Each result is saved with sample ID, time, GPS, photo, reagent batch and calibration version |
| Steps get skipped or timed by guesswork | An 8-step guided wizard with a reaction timer that keeps the screen on and alerts when the reaction is complete |
| No signal at remote sites | Fully offline. Data syncs from the analyser over Bluetooth, not the internet |
| Reagents expire or run out mid-survey | Stock is deducted per test, with low-stock and expiry warnings |
| Results need to reach a lab or authority | One-tap PDF / CSV reports through the Android share sheet |

## ✨ Features

| | Feature | Details |
|---|---|---|
| 🧪 | **Guided test** | Parameter → sample → photo → GPS → safety → reagent batch → timer → measure |
| 📡 | **Bluetooth analyser** | Scan, pair, auto-reconnect, device status, clock sync, offline result sync with duplicate detection |
| 📊 | **Results** | Concentration with quality flags, camera cross-check, dilution correction, retest and compare |
| 📈 | **History & analytics** | Search and filter, per-sample history, trend charts |
| 🎯 | **Calibration** | Multi-point linear fit, versioning, rollback, push to the analyser |
| 🧴 | **Reagent inventory** | Batches, units (mL, drops, pillows, tablets…), expiry date picker, stock alerts |
| ⏱️ | **Reaction timer** | Screen stays on and the phone vibrates at zero; OS-scheduled notification as backup, survives app close and restart |
| 📄 | **Reports** | PDF and CSV export |
| 💾 | **Backup** | Full backup and restore of data and photos in one file |
| 🔒 | **Privacy** | Permissions are asked only when a feature needs them. No background location |
| 🌗 | **Themes** | Light and dark mode, accessible labels |

## 📲 Install

1. Download **[`SipSure-0.1.0.apk`](../../releases/latest)** on your phone.
2. Open it and allow *Install unknown apps* for your browser or file manager when asked.
3. Launch **SipSure**.

> Requires Android 7.0 or newer on an ARM phone (almost every phone). About 50 MB.

## 🧭 How to use

| Step | Where | What to do |
|:-:|---|---|
| 1 | **Welcome** | Finish the short onboarding |
| 2 | **More → Devices** | Pair the analyser. Bluetooth permission is requested here |
| 3 | **Reagents → Add reagent** | Add your reagent batches with quantity, unit and expiry |
| 4 | **More → Calibration** | Enter the standards for each parameter and save a calibration version |
| 5 | **Home → New test** | Follow the wizard: sample, photo, location, safety, reagent, timer, measure |
| 6 | **Result** | Review the value and flags. Retest or apply dilution if needed |
| 7 | **History / Reports** | Browse past results and export PDF or CSV |
| 8 | **More → Backup** | Back up regularly to keep a copy off the phone |

## 📡 Connecting the analyser

The app talks to the ESP32 over the **Nordic UART Service** using newline-delimited JSON messages.

- Firmware authors: match the message contract defined in [`src/config/ble.ts`](src/config/ble.ts) and
  [`src/services/bluetooth/`](src/services/bluetooth/), and the app works unchanged.
- Different firmware contract? Only those files need to change.

## 🚦 Project status

**v0.1.0: app features built, hardware pending.** Covered by 249 automated tests.
The release APK has been verified on a physical Android 16 phone.

| Item | Status |
|---|---|
| App features | ✅ Complete |
| Bluetooth protocol | 🟡 Provisional. Tested against a simulated analyser only, until the analyser firmware is available |
| Reagent safety text | 🟡 Placeholder until wording from the reagent SDS or lab is supplied |
| Lab values (cross-check tolerance, LOD/LOQ, lead range) | 🟡 Pending from the lab |
| Languages | English only |

## 🛠️ For developers

<details>
<summary><b>Run, test and build</b></summary>

**Requirements:** Node 24, npm 11, JDK 17+, Android SDK 36.

```bash
npm ci
npm run verify                          # type-check + lint + tests
EXPO_PUBLIC_BLE_MOCK=1 npx expo start   # dev build with a simulated analyser
```

**Release APK.** The `android/` folder is generated and git-ignored.

```bash
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

Signing reads a keystore properties file kept **outside the repository** (`~/.sipsure/keystore.properties`
or `$SIPSURE_KEYSTORE_PROPERTIES`).

**Stack:** Expo SDK 54 · React Native 0.81 · React 19.1 · TypeScript · Expo Router · SQLite · Zustand · Zod ·
react-native-ble-plx · Jest + React Native Testing Library

</details>
