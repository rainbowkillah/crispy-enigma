Example request using authenticated AI Gateway
Add `cf-aig-authorization` header before enabling authenticated AI Gateway in gateway settings.

Local reference (per tenant, ignored by git):
```
CF_AIG_TOKEN=replace-me
```

```bash

curl https://gateway.ai.cloudflare.com/v1/9acbaee838d01aa096e63ad4551fda77/ai-gate/openai/chat/completions \
  --header 'cf-aig-authorization: Bearer {CF_AIG_TOKEN}' \
  --header 'Authorization: Bearer OPENAI_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"model": "gpt-5.1", "messages": [{"role": "user", "content": "What is Cloudflare?"}]}'

```

```bash
curl "https://api.cloudflare.com/client/v4/accounts/9acbaee838d01aa096e63ad4551fda77/tokens/verify" \
-H "Authorization: Bearer {CF_API_TOKEN}"

```

MrRainbowSmoke

Gateway slug must match tenant config:
- `tenants/mrrainbowsmoke/tenant.config.json` → `aiGatewayId: "ai-gate"`

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "{cf_api_token}",
  baseURL:
    "https://gateway.ai.cloudflare.com/v1/9acbaee838d01aa096e63ad4551fda77/ai-gate/compat",
});

const response = await client.chat.completions.create({
  model: "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  messages: [{ role: "user", content: "Hello, world!" }],
});
```

```js
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.AI.run("workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      prompt: "What is Cloudflare?",
    }, {
      gateway: {
        id: "ai-gate",
      },
    });

    return Response.json(response);
  },
};
```

RainbowSmokeOfficial

Gateway slug must match tenant config:
- `tenants/rainbowsmokeofficial/tenant.config.json` → `aiGatewayId: "ai_gateway"`

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "{cf_api_token}",
  baseURL:
    "https://gateway.ai.cloudflare.com/v1/7fde695caf9cc41efca391316eb71003/ai_gateway/compat",
});

const response = await client.chat.completions.create({
  model: "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  messages: [{ role: "user", content: "Hello, world!" }],
});
```

```js
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.AI.run("workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      prompt: "What is Cloudflare?",
    }, {
      gateway: {
        id: "ai_gateway",
      },
    });

    return Response.json(response);
  },
};
```
