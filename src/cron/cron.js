const cron = require("node-cron");
const User = require("../modules/user/user.model");

cron.schedule("0 23 * * *", async () => {
  console.log("Running daily token cleanup at 23:00");
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  await User.updateMany(
    { lastActivity: { $lt: threeDaysAgo }, refreshToken: { $ne: null } },
    { refreshToken: null },
  );
});
