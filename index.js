
require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const allowedUserId = process.env.ALLOWED_USER_ID?.trim();

if (!config.channelSecret || !config.channelAccessToken) {
  throw new Error("請先在 .env 設定 LINE_CHANNEL_SECRET 和 LINE_CHANNEL_ACCESS_TOKEN");
}

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// LINE Webhook：驗證簽章後再處理訊息
app.post("/webhook", line.middleware(config), async (req, res) => {
  // 先回覆 HTTP 200，表示已收到 Webhook
  res.sendStatus(200);

  for (const event of req.body.events || []) {
    try {
      // 只處理文字訊息
      if (
        event.type !== "message" ||
        event.message.type !== "text" ||
        !event.source?.userId
      ) {
        continue;
      }

      const userId = event.source.userId;

      // 方便第一次設定時取得自己的 LINE User ID
      console.log("收到文字訊息，User ID：", userId);

      // 尚未設定白名單時，不回覆任何人
      if (!allowedUserId) {
        console.log("尚未設定 ALLOWED_USER_ID，暫不回覆。");
        continue;
      }

      // 只允許自己的 LINE 帳號使用
      if (userId !== allowedUserId) {
        console.log("非允許的使用者，忽略訊息。");
        continue;
      }

      // LINE 單則文字訊息上限為 5000 字元
      if (event.message.text.length > 5000) {
        console.log("訊息超過 5000 字元，未回覆。");
        continue;
      }

      // 原樣複述收到的文字
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
      console.error("處理訊息失敗：", error.message);
    }
  }
});

app.get("/", (req, res) => {
  res.send("LINE Echo Bot is running.");
});

app.listen(PORT, () => {
  console.log(`LINE Echo Bot 已啟動：http://localhost:${PORT}`);
});
