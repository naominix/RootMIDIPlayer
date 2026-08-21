# Root MIDI Player 🎵🤖

iRobot Root® コーディングロボットを **Web Bluetooth API** で直接接続し、アップロードした MIDI ファイルのノート情報を解析してロボットのブザー（音符再生コマンド）で演奏する Web アプリケーションです。

🔗 **GitHub Pages URL**: [https://naominix.github.io/RootMIDIPlayer/](https://naominix.github.io/RootMIDIPlayer/)

---

## 🌟 特長

- 🔌 **Web Bluetooth API 接続**: ブラウザからワンクリックで iRobot Root に BLE 接続。
- 🎼 **MIDI 解析 & 単音化 (Monophonic Conversion)**:
  - `@tonejs/midi` を使用してマルチトラック MIDI を解析。
  - 和音や重なり合う音を **高音優先 (Highest)** / **低音優先 (Lowest)** / **強音優先 (Velocity)** から自動単音化。
- 🎹 **シーケンス可視化**: 再生ヘッドと連動するメロディ ピアノロール Canvas 表示。
- 🔊 **ブラウザ音声プレビュー**: Web Audio API によるシンセサイザー同時発音（ロボットが手元になくても試聴可能）。
- ✨ **Root LED 連動**: 再生中の音高に応じた RGB カラーで Root の LED リングを発光。
- 📦 **単一ファイル設計**: ビルド不要・npm不要、CDN のみで動作するスタンドアロンな `index.html`。
- 🎶 **プリセット楽曲内蔵**: スーパーマリオ、きらきら星、第九・歓喜の歌、エリーゼのために、カノンを内蔵。

---

## 🛠 プロトコル仕様 (iRobot Root BLE Protocol)

本アプリケーションは公式の Root ロボット BLE プロトコルに準拠しています。

- **Root Identifier Service UUID**: `48c5d828-ac2a-442d-97a3-0c9822b04979`
- **UART Service UUID**: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **TX Characteristic (Host → Robot)**: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- **RX Characteristic (Robot → Host)**: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

### 送信パケットフォーマット (20 Bytes)

| バイト位置 | フィールド | 説明 |
| :--- | :--- | :--- |
| `0` | **Device ID** | `0x05` (Sound) / `0x03` (Lights) |
| `1` | **Command ID** | `0x00` (Play Note) / `0x01` (Stop Sound) / `0x02` (Set Lights) |
| `2` | **Sequence Number** | 連番 (`0`〜`255`) |
| `3..6` | **Frequency (Hz)** | 32-bit Big Endian 符号なし整数 (Play Note 時) |
| `7..8` | **Duration (ms)** | 16-bit Big Endian 符号なし整数 (Play Note 時) |
| `9..18` | **Padding** | `0x00` |
| `19` | **CRC-8 Checksum** | 0〜18バイト目の CRC-8 チェックサム |

---

## 🚀 動作環境

Web Bluetooth API をサポートするブラウザ（**Google Chrome / Microsoft Edge / Opera** など）で、**HTTPS** または **http://localhost** 経由でアクセスしてください。

ローカルで実行する場合:
```bash
python3 -m http.server 8000
```
ブラウザで `http://localhost:8000` を開きます。

---

## 📄 ライセンス

[MIT License](LICENSE)
