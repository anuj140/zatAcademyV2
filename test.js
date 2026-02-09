const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  age: Number,
});

const user = await userSchema.create({ name: "Raj", age: 28 });

const query = userSchema.updateOne({});

const express = require("express");
const app = express();



app.listen(3000, () => {
  console.log(`Server is listening on port 3000...`);
});
