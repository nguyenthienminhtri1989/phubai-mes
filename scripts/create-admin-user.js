// Tạo (hoặc cập nhật) một tài khoản ADMIN đầu tiên cho PHUBAI-MES.
// Dùng khi chưa có user nào trong DB để đăng nhập lần đầu.
//
// Cách dùng:
//   node scripts/create-admin-user.js <username> <password> "<Họ tên>"
//
// Ví dụ:
//   node scripts/create-admin-user.js admin "MatKhauManh123" "Quản trị viên"

import "dotenv/config";
import crypto from "node:crypto";
import * as bcrypt from "bcryptjs";
import pg from "pg";

const { Client } = pg;

async function main() {
  const [username, password, fullName] = process.argv.slice(2);

  if (!username || !password || !fullName) {
    console.error('Cach dung: node scripts/create-admin-user.js <username> <password> "<Ho ten>"');
    process.exitCode = 1;
    return;
  }

  if (password.length < 6) {
    console.error("Mat khau phai co it nhat 6 ky tu.");
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const hashed = await bcrypt.hash(password, 10);

    const result = await client.query(
      `insert into "User" ("id", "username", "password", "fullName", "role", "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'ADMIN', true, now(), now())
       on conflict ("username") do update set
         "password" = excluded."password",
         "fullName" = excluded."fullName",
         "role" = 'ADMIN',
         "isActive" = true,
         "updatedAt" = now()
       returning "username", "fullName"`,
      [`user_${crypto.randomUUID()}`, username, hashed, fullName],
    );

    console.log(`Da tao/cap nhat ADMIN: ${result.rows[0].username} (${result.rows[0].fullName})`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
