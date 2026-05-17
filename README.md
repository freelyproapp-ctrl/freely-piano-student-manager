# freelyピアノ教室 生徒管理アプリ

スマホで使うための構成:

- 画面の公開: GitHub Pages
- データ保存: Supabase
- ログイン: Supabase Auth
- スマホ利用: Safari / Chromeで開いてホーム画面に追加

## いまの状態

Supabase未設定の間は、このパソコン内だけのデモ保存で動きます。

ローカル確認:

http://localhost:4173

デモログイン:

- ID: `teacher`
- パスワード: `admin123`

## Supabaseでやること

1. Supabaseで新しいプロジェクトを作ります。
2. SQL Editorを開きます。
3. `supabase-schema.sql` の中身を貼り付けて実行します。
4. Authentication > Users から講師用ユーザーを追加します。
5. Project Settings > API Keys から次の2つを控えます。
   - Project URL
   - Publishable key
6. `config.js` に貼り付けます。

```js
window.PIANO_APP_CONFIG = {
  supabaseUrl: "Project URLをここに貼ります",
  supabaseAnonKey: "Publishable keyをここに貼ります",
};
```

## GitHub Pagesでやること

1. GitHubで新しいリポジトリを作ります。
2. このフォルダのファイルをアップロードします。
3. GitHubの Settings > Pages を開きます。
4. Sourceを `Deploy from a branch` にします。
5. Branchを `main`、フォルダを `/root` にします。
6. 表示されたURLをスマホで開きます。
7. スマホの共有メニューから「ホーム画面に追加」を選びます。

## できること

- 生徒カードの追加、編集、削除
- 名前、学年、コース、曜日、開始時間、レッスン費の管理
- 領収チェック、領収日、領収メモの管理
- お教室からの案内事項の管理
- 講師メモの管理
- レッスンコースと料金の編集
- お教室名の変更
