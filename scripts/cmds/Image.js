module.exports = {
  config: {
    name: "image",
    version: "1.0",
    author: "Thataone",
    countDown: 5,
    role: 0,
    shortDescription: "Generate AI images using Norch Project API",
    longDescription: "Uses Norch Project Image API to generate images from prompts"
  },

  onStart: async function ({ message, event, args }) {
    const prompt = args.join(" ");
    if (!prompt)
      return message.reply("❌ Please enter a prompt.\nExample: image a dragon flying");

    message.reply("🎨 Generating your image… please wait!");

    try {
      // Norch API endpoint
      const apiUrl = `https://norch-project.gleeze.com/api/Image?prompt=${encodeURIComponent(prompt)}`;

      // Request Norch API
      const response = await axios.get(apiUrl);

      if (!response.data || !response.data.imageUrl) {
        return message.reply("❌ The API did not return an image. Try another prompt.");
      }

      const imageUrl = response.data.imageUrl;

      // Download the image
      const imgPath = __dirname + `/cache/${Date.now()}.png`;
      const img = await axios.get(imageUrl, { responseType: "arraybuffer" });
      fs.writeFileSync(imgPath, img.data);

      // Send image back
      message.reply(
        {
          body: `✅ Image created!\n\nPrompt: ${prompt}`,
          attachment: fs.createReadStream(imgPath)
        },
        () => fs.unlinkSync(imgPath) // auto-delete after sending
      );

    } catch (error) {
      console.error(error);
      message.reply("❌ Failed to generate the image. The Norch API may be down.");
    }
  }
};
