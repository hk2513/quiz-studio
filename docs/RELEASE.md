# 公開と更新

Quiz Studioのソースコードは https://github.com/hk2513/quiz-studio で管理します。元サイトの問題集・画像・Git履歴は含めません。

## 変更を準備する

```sh
git clone https://github.com/hk2513/quiz-studio.git
cd quiz-studio
npm test
npm run check
```

1. ブランチで変更し、動作確認とテストを行う。
2. 差分に非公開問題集、個人情報、認証ファイル、トークンがないことを確認する。
3. READMEの使い方・既知の制限とCHANGELOGを更新する。
4. Pull RequestのレビューとCIを経てmainへ統合する。
5. バージョンのタグとReleaseを作成し、確認済み機能・未検証環境を記載する。

GitHubのIssuesで不具合・改善提案を受け付けます。脆弱性はSecurity → Report a vulnerabilityから非公開で報告します。

## GitHub Pages

設定画面のPagesでSourceをGitHub Actionsにします。配信対象は `web/` の静的ファイルのみです。

`.github/workflows/pages.yml` は **手動実行のみ** です。pushではデプロイされません。所有者が変更内容と公開を承認した後、Actionsの「Deploy approved demo」で対象ブランチを確認し、`approved` を有効にして実行します。

ワークフローはテスト → 静的ファイル検査 → Pages artifact作成 → デプロイの順です。`web/` 以外の元資料や検証用ファイルを配信対象に追加しないでください。完了後は実際の公開URLで読み込み・演習・保存を確認します。既存の別サイトにはデプロイしません。

データ形式の破壊的な変更には移行処理と説明を用意します。ブラウザに保存される問題集は、サイト更新時にサーバーへ送信しません。

## 実績の扱い

元サイトとOSS版の実績を分けます。利用人数、再現可能なテスト結果、Issue・PR・Releaseなど、確認できるものだけを記載します。外部プログラムの応募条件は応募時に公式情報で確認してください。

参考：

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://choosealicense.com/licenses/mit/
