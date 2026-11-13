
require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const allowedUserId = process.env.ALLOWED_USER_ID?.trim();
const firecrawlWebhookSecret = process.env.FIRECRAWL_WEBHOOK_SECRET?.trim();

const PRODUCT_URL =
  "https://shop.masking-tape.jp/point/detail.php?pointitem_id=108";

if (!config.channelSecret || !config.channelAccessToken) {
  throw new Error("請先設定 LINE_CHANNEL_SECRET 和 LINE_CHANNEL_ACCESS_TOKEN");
}

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// Firecrawl webhook：驗證來源後，只處理缺貨轉為有貨
app.post("/webhooks/firecrawl", express.json({ limit: "1mb" }), async (req, res) => {
  const authHeader = req.get("authorization") || "";
  const expectedHeader = `Bearer ${firecrawlWebhookSecret || ""}`;

  const received = Buffer.from(authHeader);
  const expected = Buffer.from(expectedHeader);

  const authorized =
    Boolean(firecrawlWebhookSecret) &&
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected);

  if (!authorized) {
    return res.sendStatus(401);
  }

  const payload = req.body;

  if (payload?.type !== "monitor.page") {
    return res.sendStatus(200);
  }

  const pages = Array.isArray(payload.data) ? payload.data : [];

  for (const page of pages) {
    try {
      if (
        page.url !== PRODUCT_URL ||
        page.status !== "changed"
      ) {
        continue;
      }

      const stockChange = page.diff?.json?.availability_status;

      // 僅接受「缺貨 → 有貨」的明確狀態轉換
      if (
        stockChange?.previous !== "out_of_stock" ||
        stockChange?.current !== "in_stock"
      ) {
        continue;
      }

      if (!allowedUserId) {
        console.error("尚未設定 ALLOWED_USER_ID，無法發送補貨通知。");
        continue;
      }

      await client.pushMessage({
        to: allowedUserId,
        messages: [
          {
            type: "text",
            text:
              "📢 mt 商品可能補貨了！\n\n" +
              "テープセットラベルテープ（1巻）\n\n" +
              "商品頁面已從缺貨變成有貨，請盡快確認：\n" +
              PRODUCT_URL,
          },
        ],
      });

      console.log("已發送 mt 補貨 LINE 通知。");
    } catch (error) {
      console.error("處理補貨通知失敗：", error.message);
    }
  }

  return res.sendStatus(200);
});

// 原本的 LINE Bot Webhook：保留文字複述功能
app.post("/webhook", line.middleware(config), async (req, res) => {
  res.sendStatus(200);

  for (const event of req.body.events || []) {
    try {
      if (
        event.type !== "message" ||
        event.message.type !== "text" ||
        !event.source?.userId
      ) {
        continue;
      }

      const userId = event.source.userId;
      console.log("收到文字訊息，User ID：", userId);

      if (!allowedUserId) {
        console.log("尚未設定 ALLOWED_USER_ID，暫不回覆。");
        continue;
      }

      if (userId !== allowedUserId) {
        console.log("非允許的使用者，忽略訊息。");
        continue;
      }

      if (event.message.text.length > 5000) {
        console.log("訊息超過 5000 字元，未回覆。");
        continue;
      }

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: event.message.text,
          },
        ],
      });

      console.log("已回覆原文。");
    } catch (error) {
      console.error("處理 LINE 訊息失敗：", error.message);
    }
  }
});

app.get("/", (req, res) => {
  res.send("LINE Echo Bot is running.");
});

app.listen(PORT, () => {
  console.log(`LINE Echo Bot 已啟動，Port：${PORT}`);
});
