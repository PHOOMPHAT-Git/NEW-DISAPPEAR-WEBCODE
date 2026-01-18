import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.get("/config.js", (req, res) => {
    res.type("application/javascript").send(
        "window.APP_CONFIG=" +
            JSON.stringify({
                DISCORD: process.env.DISCORD || "",
                YOUTUBE: process.env.YOUTUBE || "",
                TIKTOK: process.env.TIKTOK || ""
            }) +
            ";"
    );
});

app.use(express.static("public"));

app.listen(3000);