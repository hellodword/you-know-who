export default {
    async fetch(req, env, ctx) {
        const userAgent = req.headers.get("User-Agent") || "";
        const isShadowRocket = userAgent.toLowerCase().indexOf("shadowrocket") != -1;

        const url = new URL(req.url);

        const vTag = url.searchParams.get("v_tag");
        const vType = url.searchParams.get("v_type");
        const vUUID = url.searchParams.get("v_uuid");
        const vHost = url.searchParams.get("v_host");
        const vPath = url.searchParams.get("v_path");
        const vName = url.searchParams.get("v_name");
        const vHY2Pass = url.searchParams.get("v_hy2_pass");
        const vHY2Port = url.searchParams.get("v_hy2_port");


        const hosts = JSON.parse(env.DIRECT_HOSTS);

        if (vType === 'direct-vmess') {

            if (!isShadowRocket) {
                return new Response("error");
            }

            if (!vTag || !vUUID || !vHost || !vPath || !vName) {
                return new Response("error");
            }

            let outputs = [];

            for (let host in hosts) {
                const vmessName = `${vTag}:${vName}:cf:${hosts[host]}`;
                const realHost = `${hosts[host].replace(/\./g, '-')}.${vHost}`;

                outputs.push(`vmess://${btoa(`auto:${vUUID}@${host}:443`)}?remarks=${vmessName}&obfsParam=%7B%22Host%22:%22${realHost}%22%7D&path=${vPath}&obfs=websocket&tls=1&mux=1&alterId=0&sni=${vHost}`);
            }

            return new Response(btoa(outputs.join("\n")), {
                headers: {
                    "content-type": "text/html; charset=UTF-8",
                }
            });
        }


        if (vType === 'direct-hy2') {

            if (!isShadowRocket) {
                return new Response("error");
            }

            if (!vTag || !vHost || !vName || !vHY2Pass || !vHY2Port) {
                return new Response("error");
            }

            let outputs = [];

            for (let host in hosts) {
                const hy2Name = `${vTag}:${vName}:hy2:${hosts[host]}`;
                const realHost = `${hosts[host].replace(/\./g, '-')}.${vHost}`;

                outputs.push(`hysteria2://${vHY2Pass}@${host}:${vHY2Port}?peer=${realHost}&obfs=none#${hy2Name}`)
            }

            return new Response(btoa(outputs.join("\n")), {
                headers: {
                    "content-type": "text/html; charset=UTF-8",
                }
            });
        }

        const vNetwork = url.searchParams.get("v_network");
        const vNum = parseInt(url.searchParams.get("v_num"));

        if (!vTag || !vUUID || !vHost || !vPath || !vName || !vNetwork || vNum <= 0 || vNum > 5) {
            return new Response("error");
        }

        const fetchData = async (_type) => {
            let outputs = [];
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
            return outputs;
        };

        let outputs4 = [];
        let outputs6 = [];

        if (vType !== "6") {
            outputs4 = await fetchData("v4");
        }

        if (vType !== "4") {
            outputs6 = await fetchData("v6");
        }

        return new Response(btoa(outputs4.slice(0, vNum).concat(outputs6.slice(0, vNum)).join("\n")), {
            headers: {
                "content-type": "text/html; charset=UTF-8",
            }
        });
    },
};
