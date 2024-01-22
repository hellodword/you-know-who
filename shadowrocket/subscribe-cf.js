export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        const vType = url.searchParams.get("v_type");
        const vTag = url.searchParams.get("v_tag");
        const vUUID = url.searchParams.get("v_uuid");
        const vHost = url.searchParams.get("v_host");
        const vPath = url.searchParams.get("v_path");
        const vName = url.searchParams.get("v_name");
        const vNetwork = url.searchParams.get("v_network");

        if (!vTag || !vUUID || !vHost || !vPath || !vName || !vNetwork) {
            return new Response("error");
        }

        const userAgent = req.headers.get("User-Agent") || "";
        const isShadowRocket = userAgent.toLowerCase().indexOf("shadowrocket") != -1;

        let outputs = [];


        const fetchData = async (_type) => {
            try {
                const response = await fetch('https://api.hostmonit.com/get_optimization_ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ "key": "o1zrmHAF", "type": _type })
                });

                if (response.ok) {
                    const data = await response.json();
                    data.info[vNetwork.toUpperCase()].forEach((item, i) => {
                        const name = `${vTag}:${vName}:cf:yes-${vNetwork.toLowerCase()}-${_type}-${i}`;
                        if (isShadowRocket) {
                            outputs.push(`vmess://${btoa(`auto:${vUUID}@${item.ip}:443`)}?remarks=${name}&obfsParam=%7B%22Host%22:%22${vHost}%22%7D&path=${vPath}&obfs=websocket&tls=1&mux=1&alterId=0&sni=${vHost}`);
                        } else {
                            outputs.push(`vmess://${btoa(`{"add":"${item.ip}","aid":"0","alpn":"","fp":"","host":"${vHost}","id":"${vUUID}","net":"ws","path":"${vPath}","port":"443","ps":"${name}","scy":"aes-128-gcm","sni":"${vHost}","tls":"tls","type":"","v":"2"}`)}`);
                        }
                    });
                } else {
                    console.error('Error:', response.statusText);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        };

        if (vType !== "6") {
            await fetchData("v4");
        }

        if (vType !== "4") {
            await fetchData("v6");
        }

        return new Response(btoa(outputs.join("\n")), {
            headers: {
                "content-type": "text/html; charset=UTF-8",
            }
        });
    },
};
