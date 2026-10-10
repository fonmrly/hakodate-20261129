# 函館旅行アプリ 仕様書

## 1. 目的

2026-11-28〜11-30 の函館旅行で、2人がスマホから同じ旅程・食事メモ・旅費・写真を閲覧／編集するための軽量Webアプリ。

台湾旅行アプリ `DokkaIkitai/taiwan-202610` の操作感を参考にしたが、**台湾旅行アプリの実データ・Supabase・写真・旅費には一切書き込まない**。

## 2. 現在の公開構成

- 静的フロント: GitHub Pages 用 `index.html`
- API: Supabase Edge Function `hakodate-trip-202611`
- Supabase project: 既存 Sol Task Store project を共有
- DB schema: **`hakodate_trip_202611`**（`sts` とは別）
- Storage bucket: **`hakodate-trip-202611`**（private）
- 合言葉認証: Edge Function 側
- 端末同期: 約5秒のポーリング
- GitHub repo: `fonmrly/hakodate-20261129`

## 3. 旅程の初期値

### 11/28（土）
- 12:50 羽田発 ANA NH555
- 14:10 函館空港着
- ホテル: NIPPONIA HOTEL 函館 港町
- 15時台 ホテル着／荷物を置く
- 15:40頃 函館山ロープウェイ
- 16:10頃 日没→夜景
- 19:30頃 蔵や（炉端・海鮮）
- ホテルへ戻ってのんびり

### 11/29（日）
- 朝はホテルでゆっくり
- 10:00 観光タクシー（道南ハイヤー／SOW EXPERIENCE、2名、約2〜3時間）
- ゴールデンカムイ／箱館戦争ゆかりの場所
- 最後は五稜郭で解散
- 五稜郭タワー／公園／箱館奉行所などをゆっくり
- 13:30〜14:00頃 ラッキーピエロ五稜郭公園前店
- 午後 ホテル休憩
- 19:00 ホテルディナー

### 11/30（月）
- 元町・八幡坂・赤レンガ周辺を気分で散歩
- 11:00頃 チェックアウト
- 軽く昼食
- 12:45〜13:00頃 ホテル発
- 14:50 函館発 ANA NH556
- 16:20 羽田着

## 4. 機能

### 日別画面
- 3日間の切替
- AREA
- 時刻＋予定の追加／編集／削除
- 食事メモ（朝／昼／夜／間食）
- 旅の思い出メモ
- 旅費入力（円、誰の支出か）
- 日別合計＋旅行全体合計
- 写真追加／一覧／キャプション／削除
- Google Maps 検索リンク

### アルバム
- 全写真
- 日付フィルタ
- 拡大表示
- キャプション編集
- 削除

### 共有
- 予定・食事・思い出・旅費を Supabase の単一 shared state に保存
- 写真本体は private Storage
- 写真メタデータは `hakodate_trip_202611.photos`
- 2端末は約5秒ごとに更新を取得

## 5. 認証

- 公開HTMLに合言葉そのものを埋め込まない
- 合言葉検証は Edge Function
- ログイン後に一時トークンをブラウザ sessionStorage へ保存
- スマホで日本語IMEを使えるよう、合言葉入力は `type=text` / `inputmode=text`
- **合言葉の二重画面は禁止**（外側ランチャーの1回のみ）

## 6. データ分離

禁止:
- `sts` schema の変更
- 台湾旅行アプリのDB／Storageへの書き込み
- 台湾旅行アプリの既存データ編集
- 他プロジェクトのデータ削除

函館専用:
- `hakodate_trip_202611.trip_state`
- `hakodate_trip_202611.photos`
- Storage `hakodate-trip-202611`

## 7. 現在の状態

- 2026-10-10 に Sol OL / Codex で画像アップロード障害をデバッグし、launcher と APP のグローバル `const API` 再宣言、および canvas 例外時に upload request へ進まない問題を修正した。
- production相当の実Supabaseで state save/get、JPEG/PNG/WebP の Storage upload、metadata、signed URL、list、caption更新、delete を実施してPASS。
- 本番テスト用データは終了後に削除済み。DB row / Storage object / state marker がすべて0件であることを確認済み。
- GitHub Pages の正式公開設定はrepository側のPages有効化後に利用する。
- production Edge Functionの秘密値をpublic repoへ出さないため、repo側ソースでは合言葉／セッショントークンを環境変数化している。

## 8. デバッグ／受入条件

Codex は次を実施する。

1. フロント→Edge Function→Storage→photos metadata→signed URL の画像経路を追う。
2. 日本語合言葉で1回だけログインできる。
3. 予定／食事／思い出／旅費を端末A相当で変更し、端末B相当で同期されることを確認。
4. 画像JPEG/PNG/WebPのアップロード、一覧、キャプション変更、削除を確認。
5. エラー時に既存データを壊さない。
6. テストには production 相当の実データを書き込んでよい。ただし **必ず TEST- 接頭辞等で識別できるテストデータを使う**。
7. **全テスト終了後、Codexが作成したテスト用DBレコード・写真ファイル・旅費・メモ・予定変更を全て削除／原状復帰する。**
8. 初期旅程そのものは消さない。
9. 台湾旅行データ・STSには触れない。
10. 最終報告に「再現原因」「変更点」「実施テスト」「テストデータ削除確認」「未解決点」を含める。

## 9. セキュリティ留意

- public repoへ実合言葉、セッショントークン、service role key等をcommitしない。
- Edge Functionだけがservice roleを使用する。
- DB schemaはanon/authenticatedへの権限をrevokeしている。
- RLSは現状未有効。APIをEdge Function一本に限定しているが、今後の改善候補としてRLS有効化を検討する。
