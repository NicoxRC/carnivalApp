import { generateVAPIDKeys } from "web-push";

const { publicKey, privateKey } = generateVAPIDKeys();
console.log(`# These go into the backend's secrets (sops secrets/dev.enc.yaml), never into the web.
VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_CONTACT=mailto:change-to-a-real-address@example.com`);
