import { createApp } from "./app.ts";
import { getDatabase } from "./db/database.ts";

const port = Number(Deno.env.get("PORT") ?? "3000");
const db = getDatabase();
const app = createApp(db, { enableSupabaseSync: true });

console.log(`============================================================`);
console.log(`🍲 Ev Yemeklerim — E-Ticaret ve Sipariş Yönetim Platformu`);
console.log(`🚀 Sunucu Çalışıyor: http://localhost:${port}`);
console.log(`👩‍🍳 Yönetici Demo : admin@evyemeklerim.com / Admin123!`);
console.log(`🙋‍♀️ Müşteri Demo  : ayse@ornek.com / Musteri123!`);
console.log(`============================================================`);

Deno.serve({ port, hostname: "127.0.0.1" }, app.fetch);
