# Root MIDI Player 🎵🤖🤖

iRobot Root® コーディングロボットを **Web Bluetooth API** で複数台接続し、MIDI ファイルのノート情報を解析して各ロボットおよび PC 音源に最適なパート（主旋律・和音伴奏・ベース等）を自動割り当てして合奏（アンサンブル）演奏する Web アプリケーションです。

🔗 **GitHub Pages 公開 URL**: [https://naominix.github.io/RootMIDIPlayer/](https://naominix.github.io/RootMIDIPlayer/)

---

## 🌟 主な機能

### 🤖 1. 複数台 Root のマルチ接続 & 合奏 (Multi-Robot Ensemble)
- **複数台の同時接続**: 「**Rootを追加接続**」ボタンから 2 台、3 台、4 台... と複数の Root ロボットを個別にペアリング可能。
- **スロット色分け & LED連動**: 各ロボットに専用の識別カラー（#1: エメラルド, #2: シアン, #3: バイオレット, #4: アンバー, #5: ローズ）が割り当てられ、発音中の音階に合わせてトップリング LED が発光。
- **個別操作**: ロボットごとにテスト発音、LED点灯テスト、ミュート、切断が可能。

### ⚡ 2. パート自動最適化 & 割り当て (Intelligent Part Auto-Allocation)
- **トラック役割の自動解析**: 各トラックの平均音高・音域・音数・楽器種別から「主旋律 (Melody)」「和音・伴奏 (Harmony)」「低音 (Bass)」「高音装飾 (Treble)」を自動判定。
- **最適なパート配分**:
  - **1台接続時**: Root ＝ 主旋律, PC ＝ 伴奏/ベース
  - **2台接続時**: Root #1 ＝ 主旋律, Root #2 ＝ 高音装飾/対旋律, PC ＝ 伴奏/ベース
  - **3台接続時**: Root #1 ＝ 主旋律, Root #2 ＝ 和音伴奏, Root #3 ＝ ベース, PC ＝ 装飾/ストリングス
- **和音分散ボイス（Voice Splitting）**: 1トラックのピアノ曲や和音を含む曲でも、最高音（Top）・中音（Mid）・低音（Bass）のボイスに自動分割して複数台でハーモニー演奏が可能。
- **手動オーバーライド**: 各ロボットや PC 音源の担当パートはドロップダウンから自由に変更可能。

### 💻 3. PC ブラウザ音源の独立パート割り当て
- PC の Web Audio シンセサイザーも 1 つの演奏プレイヤーとして独立動作。
- Root ロボットと同じ音を重ねるだけでなく、**「Root が担当していない別のトラック（例: ロボットがメロディを歌い、PC がアルペジオ伴奏やベースを演奏）」** を自動または手動で割り当て可能。

### 🎹 4. マルチパート ピアノロール可視化
- 各デバイスの担当パートが色分けされたマルチレイヤー タイムライン。
- クリックした位置へのシーク再生に対応。

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
