# Hono on AWS Lambda Web Functions

AWS Lambda Web Functions で Hono の通常の Node.js HTTP サーバーを動かす最小サンプルです。Lambda 専用アダプターは使いません。

## ローカル実行

Node.js 24 と pnpm を用意します。

```sh
pnpm install
pnpm dev
```

別のターミナルで:

```sh
curl http://localhost:3000/
pnpm probe http://localhost:3000
```

`AWS_LAMBDA_HTTP_ENDPOINT` を設定すると、指定した `host:port` で待ち受けます。`pnpm probe` は `POST /probe` への本文送信と、8 件の同時リクエストを確認します。

## デプロイ

AWS CLI v2 の `lambda-web` コマンドが必要です。`aws lambda-web help` で利用可否を確認し、使えない場合は AWS CLI を更新してください。AWS 認証情報とリージョンを設定した後、次を実行します。

```sh
pnpm build
aws lambda-web deploy --name hono-lambda-web --code ./dist --auth-type IamAuth --create
```

`pnpm build` は ES Modules 形式の `dist/index.js` と、その形式を指定する `dist/package.json` を生成します。

以降の更新時も同じコマンドを実行します。`--create` は初回作成時の確認プロンプトを省略します。`IamAuth` のエンドポイントには、OAC 設定前の署名なしリクエストは届きません。

## CloudFront OAC と POST の検証

CloudFront のオリジンに返された Web Function エンドポイントを指定し、次を設定します。

- OAC のオリジン種別は Lambda、署名動作は `always-amz-auth`。
- Web Function のリソースポリシーで、CloudFront サービスプリンシパルに `lambda:InvokeWebFunctionEndpoint` を許可し、`aws:SourceArn` を対象ディストリビューションに限定する。
- 対象のキャッシュビヘイビアで POST を許可し、オリジンリクエストポリシーは `AllViewerExceptHostHeader` を使う。

このプロジェクトの `dev` エンドポイント向けポリシーは [`cloudfront-oac-policy.example.json`](./cloudfront-oac-policy.example.json) にあります。`<REGION>` を Web Function のリージョンに置き換えてから、Web Function 自体の ARN に設定します。

```sh
aws lambda-web put-resource-policy \
  --resource-arn 'arn:aws:lambda:<REGION>:014498617808:web-function/hono-lambda-web' \
  --policy file://cloudfront-oac-policy.example.json \
  --region YOUR_REGION
```

`put-resource-policy` は既存のポリシー全体を置き換えます。既存のステートメントがある場合は、取得したポリシーにこのステートメントを追加してから更新してください。

設定例とリソースポリシーは [Web Function のエンドポイントアクセス制御](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-endpoint-access-control.html) と [CloudFront OAC の Web Function 向け手順](https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda-web.html) を参照してください。Web Function 向け OAC では POST 本文は `UNSIGNED-PAYLOAD` として扱われ、閲覧者が `x-amz-content-sha256` を付ける必要はありません。Lambda Function URL 向け OAC の設定とは異なります。

CloudFront URL と Web Function の直接 URL を指定して検証します。

```sh
pnpm probe https://<CloudFront-domain> https://<Lambda-Web-Function-endpoint>
```

最初の POST が本文の `id` を返せば、CloudFront 経由の POST を確認できます。直接 URL への署名なし POST は HTTP 403 を期待します。続けて 8 件の POST を同時に送り、`max simultaneous in one environment` が 2 以上なら、同一実行環境内での同時処理を確認できます。1 の場合はリクエストが別環境に振り分けられた可能性があり、並列処理ができない証拠にはなりません。AWS 側の観測には CloudWatch の `EnvironmentConcurrentRequests` も利用できます。

詳細: [AWS Lambda Web Functions の作成](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-create.html)、[Web Functions の Hono サンプル](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-samples.html)
