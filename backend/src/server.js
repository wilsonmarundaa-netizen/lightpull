require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");


const scannerRoutes = require("./routes/autoscanner");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/",scannerRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});