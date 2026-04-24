const users = [
  {
    id: 1,
    email: "test@gmail.com",
    password: "test",
    role: "admin",
    created_at: new Date().toISOString()
  }
];

function getUsers() {
  return users;
}

function findUserByEmail(email) {
  return users.find(
    (user) =>
      user.email.toLowerCase() === String(email).toLowerCase().trim()
  );
}

function findUserById(id) {
  return users.find((user) => user.id === Number(id));
}

function createUser({ email, password, role }) {
  const nextId =
    users.length > 0
      ? Math.max(...users.map((user) => user.id)) + 1
      : 1;

  const newUser = {
    id: nextId,
    email: String(email).trim(),
    password: String(password),
    role: role === "admin" ? "admin" : "user",
    created_at: new Date().toISOString()
  };

  users.push(newUser);

  return newUser;
}

function deleteUser(id) {
  const index = users.findIndex(
    (user) => user.id === Number(id)
  );

  if (index === -1) return null;

  const removed = users.splice(index, 1)[0];
  return removed;
}

module.exports = {
  getUsers,
  findUserByEmail,
  findUserById,
  createUser,
  deleteUser
};