import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([
    {
      id: "NORMAL",
      code: "NORMAL",
      name: "Điện năng bình thường",
      description: "MES hiện lưu đơn giá theo ElectricityPrice.type, chưa có model EnergyType riêng.",
      isActive: true,
    },
  ]);
}
