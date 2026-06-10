const bcrypt = require("bcrypt");
const User = require("./user.model");
const GameNet = require("../gameNet/gameNet.model");

const createUser = async (data, currentUserRole) => {
  if (data.role === "superAdmin" && currentUserRole !== "superAdmin")
    throw new Error("Only super admin can create super admin");

  if (data.role === "admin") {
    const gameNet = await GameNet.findById(data.gameNetId);
    if (!gameNet) throw new Error("GameNet not found");
  }
  const hashedPassword = await bcrypt.hash(data.password, 10);
  const user = await User.create({ ...data, password: hashedPassword });
  return user;
};

const getUsers = async (
  filters = {},
  currentUserRole,
  currentUserGameNetId,
) => {
  if (currentUserRole === "superAdmin") {
    return User.find(filters).populate("gameNetId");
  } else {
    return User.find({
      gameNetId: currentUserGameNetId,
      role: "admin",
    }).populate("gameNetId");
  }
};

const updateUser = async (id, updates, currentUserRole) => {
  const user = await User.findById(id);
  if (!user) throw new Error("User not found");
  if (currentUserRole !== "superAdmin" && user.role === "superAdmin")
    throw new Error("Cannot modify super admin");
  if (updates.password)
    updates.password = await bcrypt.hash(updates.password, 10);
  Object.assign(user, updates);
  await user.save();
  return user;
};

const deleteUser = async (id, currentUserRole) => {
  const user = await User.findById(id);
  if (!user) throw new Error("User not found");
  if (currentUserRole !== "superAdmin" && user.role === "superAdmin")
    throw new Error("Cannot delete super admin");
  await user.deleteOne();
};

module.exports = { createUser, getUsers, updateUser, deleteUser };
