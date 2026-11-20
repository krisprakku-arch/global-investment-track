import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ href: "/dashboard/index.html" });
  },
  head: () => ({
    meta: [
      { title: "Global Market Technical Dashboard" },
      { name: "description", content: "แดชบอร์ดวิเคราะห์เทคนิคตลาดโลก พร้อมมาสคอตพิกเซล" },
      { property: "og:title", content: "Global Market Technical Dashboard" },
      { property: "og:description", content: "แดชบอร์ดวิเคราะห์เทคนิคตลาดโลก" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
