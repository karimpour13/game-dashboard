require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/db/mongoose");

const PORT = process.env.PORT || 3010;

connectDB().then(() => {
  require("./src/cron/cron");
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
