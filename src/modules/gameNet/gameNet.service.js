const GameNet = require("./gameNet.model");
const bcrypt = require("bcrypt");

exports.createGameNet = async (data) => {
  return GameNet.create(data);
};

exports.getGameNets = async (filters = {}) => {
  return GameNet.find(filters).sort({ createdAt: -1 });
};

exports.getGameNetById = async (id) => {
  const gameNet = await GameNet.findById(id);
  if (!gameNet) throw new Error("GameNet not found");
  return gameNet;
};

exports.updateGameNet = async (id, updates) => {
  const gameNet = await GameNet.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!gameNet) throw new Error("GameNet not found");
  return gameNet;
};

exports.updateSettings = async (id, settings) => {
  const gameNet = await GameNet.findById(id);
  if (!gameNet) throw new Error("GameNet not found");
  gameNet.settings = { ...gameNet.settings, ...settings };
  await gameNet.save();
  return gameNet;
};

exports.updateTheme = async (id, theme) => {
  const gameNet = await GameNet.findByIdAndUpdate(id, { theme }, { new: true });
  if (!gameNet) throw new Error("GameNet not found");
  return gameNet;
};

exports.deleteGameNet = async (id) => {
  const result = await GameNet.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw new Error("GameNet not found");
};
