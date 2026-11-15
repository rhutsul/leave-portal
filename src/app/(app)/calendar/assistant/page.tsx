import { redirect } from "next/navigation";

// Помічник календаря тепер — панель справа на «School calendar» (design.md D1): стара адреса веде туди, тож пряме
// посилання й закладки працюють. Роль перевіряє сторінка календаря (панель відмови, AC-ASSIST-11) і самі дії.
export default function CalendarAssistantPage() {
  redirect("/calendar?assistant=1");
}
