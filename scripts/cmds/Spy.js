const axios = require("axios");

module.exports = {
  config: {
    name: "getinfo",
    aliases: ["spy", "userinfo", "whois"],
    version: "3.0.0",
    author: "thataone",
    countDown: 5,
    role: 0,
    shortDescription: "Get detailed user information",
    longDescription:
      "Show comprehensive information about a user: basic profile, gender, profile link, nickname, admin status, and per-thread message stats. Can also attach the profile picture.",
    category: "utility",
    guide: {
      en: `{pn} [@mention|reply|uid] [-flags]
Flags:
  -p  include profile picture
  -s  include stats (messages in this GC)
  -a  all (picture + stats)

Examples:
  {pn} @user -p
  {pn} reply -a
  {pn} 100091893415755 -s`
    }
  },

  onStart: async function ({ api, args, message, event, threadsData, usersData }) {
    try {
      const { threadID, senderID, mentions = {}, messageReply } = event;

      // --- Parse flags and clean args
      const rawFlags = new Set(args.filter(a => /^-\w+$/i.test(a)));
      const flags = {
        p: rawFlags.has("-p") || rawFlags.has("-a"),
        s: rawFlags.has("-s") || rawFlags.has("-a"),
        a: rawFlags.has("-a")
      };
      const cleanArgs = args.filter(a => !a.startsWith("-"));

      // --- Resolve targets: mentions -> reply -> numeric UID -> self
      let targetIDs = [];
      if (Object.keys(mentions).length) {
        targetIDs = Object.keys(mentions);
      } else if (messageReply?.senderID) {
        targetIDs = [messageReply.senderID];
      } else if (cleanArgs[0] && /^\d+$/.test(cleanArgs[0])) {
        targetIDs = [cleanArgs[0]];
      } else {
        targetIDs = [senderID];
      }

      // Fetch thread info once (for admin/nicknames)
      const tInfo = await api.getThreadInfo(threadID);
      const adminIDs = (tInfo.adminIDs || []).map(a => String(a.id || a)); // normalize
      const nicknamesMap = tInfo.nicknames || {};
      const participants = new Set(tInfo.participantIDs || []);

      // GoatBot threadsData: get per-user counts if available
      let memberRecords = [];
      try {
        const tData = await threadsData.get(threadID);
        memberRecords = Array.isArray(tData?.members) ? tData.members : [];
      } catch (_) {
        memberRecords = [];
      }

      // Batch get user info for all targets
      const infoMap = await api.getUserInfo(targetIDs);
      const results = [];

      for (const uid of targetIDs) {
        const user = infoMap[uid] || {};
        const name =
          user.name ||
          (await usersData.getName(uid).catch(() => null)) ||
          "Unknown";

        // Gender normalize
        const g = (user.gender || "").toString().toLowerCase();
        const gender =
          g === "male" || g === "2" ? "Male" :
          g === "female" || g === "1" ? "Female" :
          "Not specified";

        // Profile link
        const vanity = user.vanity || null;
        const profileLink = vanity
          ? `https://facebook.com/${vanity}`
          : `https://facebook.com/${uid}`;

        // In this thread
        const inThisGC = participants.has(uid);
        const isAdminHere = adminIDs.includes(String(uid));
        const nicknameHere = nicknamesMap?.[uid] || null;

        // Per-user message count from GoatBot's local member store (if available)
        const memberData = memberRecords.find(m => String(m.userID) === String(uid));
        const msgCount = memberData?.count ?? null;

        // Build body
        let body = "";
        body += `🔍 DETAILED USER INFORMATION\n`;
        body += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

        body += `👤 Basic\n`;
        body += `• Name: @${name}\n`;
        body += `• UserID: ${uid}\n`;
        body += `• First Name: ${user.firstName || "N/A"}\n`;
        body += `• Gender: ${gender}\n`;
        body += `• Type: ${user.type || "USER"}\n`;
        body += `• Verified: ${user.verified ? "Yes ✓" : "No"}\n`;
        body += `• Profile: ${profileLink}\n`;

        body += `\n👥 In This Group\n`;
        body += `• Present: ${inThisGC ? "Yes" : "No"}\n`;
        body += `• Admin: ${isAdminHere ? "Yes" : "No"}\n`;
        body += `• Nickname: ${nicknameHere || "Not set"}\n`;

        if (flags.s) {
          body += `\n📈 Stats (Local)\n`;
          body += `• Messages in this GC: ${msgCount != null ? msgCount.toLocaleString() : "N/A"}\n`;
          body += `• Friend Status: ${user.isFriend ? "Friends" : "Not friends"}\n`;
          body += `• Birthday Today: ${user.isBirthday ? "Yes 🎂" : "No"}\n`;
        }

        body += `\n━━━━━━━━━━━━━━━━━━━━━\n`;

        // Mentions array for highlighting the name
        const mentionsArr = [{ id: uid, tag: name }];

        // Attachment (avatar) if requested
        if (flags.p) {
          const stream = await fetchAvatarStream(uid, user.thumbSrc).catch(() => null);
          if (stream) {
            results.push({ body, mentions: mentionsArr, attachment: stream });
            continue;
          }
        }

        results.push({ body, mentions: mentionsArr });
      }

      // Send: if any has attachment, deliver one-by-one to keep images correct
      if (results.some(r => r.attachment)) {
        for (const msg of results) {
          // eslint-disable-next-line no-await-in-loop
          await message.reply(msg);
        }
      } else {
        // aggregate into one message when no pictures (cleaner)
        const aggBody = results.map(r => r.body).join("\n");
        const allMentions = results.flatMap(r => r.mentions || []);
        await message.reply({ body: aggBody.trim(), mentions: allMentions });
      }
    } catch (err) {
      console.error("getinfo error:", err);
      await message.reply("❌ An error occurred while fetching user information. Please try again later.");
    }
  }
};

// -------- helpers --------
async function fetchAvatarStream(userID, thumbFallback) {
  // Try high-res Graph first
  try {
    const res = await axios.get(
      `https://graph.facebook.com/${userID}/picture`,
      {
        params: { width: 720, height: 720, redirect: true },
        responseType: "stream",
        maxRedirects: 5
      }
    );
    return res.data; // readable stream
  } catch (_) {
    // fallback to the small thumb if available
    if (!thumbFallback) throw _;
    const res2 = await axios.get(thumbFallback, { responseType: "stream" });
    return res2.data;
  }
        }
