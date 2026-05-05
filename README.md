# you-know-who

## Usage

```shell
npm ci

# minimal scopes
npx wrangler login --browser false --scopes account:read --scopes user:read --scopes workers_scripts:write --scopes workers_routes:write --scopes zone:read

npx wrangler whoami

# create wrangler-custom.json

npm run dev:all

npm run deploy:all
```
