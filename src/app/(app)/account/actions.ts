"use server";

import { createClient as createAuthClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import {
  hasPasswordErrors,
  INITIAL_CHANGE_PASSWORD,
  passwordFieldErrors,
  PASSWORD_MESSAGES,
  readPasswordFields,
  updateFailure,
  verifyFailure,
  type ChangePasswordState,
} from "@/lib/account/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Зміна власного пароля (ADR 0011). Без міграції: лише Supabase Auth.
 * 1. Перевірка введення — та сама, що у формі.
 * 2. Хто це — getClaims() (перевіряє JWT); getSession() для авторизації не використовуємо.
 * 3. Поточний пароль — входом окремим тимчасовим клієнтом із ПУБЛІЧНИМ ключем, без збереження сесії: куки
 *    користувача він не чіпає. Тимчасову сесію одразу закриваємо (scope "local" відкликає лише її).
 * 4. Новий пароль — updateUser сесією користувача; current_password — для налаштування Auth «Require current
 *    password», якщо його ввімкнуть (без нього Auth поле ігнорує).
 * 5. Вихід з інших сесій (scope "others"); ця сесія лишається.
 */
export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const fields = readPasswordFields(formData);
  const errors = passwordFieldErrors(fields);
  if (hasPasswordErrors(errors)) return { ...INITIAL_CHANGE_PASSWORD, errors };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  // Логін — auth.users.email із токена, а не profiles.email: вхід перевіряє саме його.
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!email) return { ...INITIAL_CHANGE_PASSWORD, message: PASSWORD_MESSAGES.failed };

  const probe = createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: probed, error: verifyError } = await probe.auth.signInWithPassword({ email, password: fields.current });
  if (verifyError) return verifyFailure(verifyError);
  // Увійшов той самий користувач, що й у сесії (email у токені — той самий логін); інакше — нічого не змінюємо.
  const sameUser = probed.user?.id === claims.sub;
  await probe.auth.signOut({ scope: "local" });
  if (!sameUser) return { ...INITIAL_CHANGE_PASSWORD, message: PASSWORD_MESSAGES.failed };

  const { error: updateError } = await supabase.auth.updateUser({
    password: fields.next,
    current_password: fields.current,
  });
  if (updateError) return updateFailure(updateError);

  // Пароль уже змінено, тож навіть якщо відкликати інші сесії не вдалось, кажемо про успіх: старим паролем уже
  // не увійти, а відкликання повторить наступна зміна пароля.
  await supabase.auth.signOut({ scope: "others" });
  return { ...INITIAL_CHANGE_PASSWORD, done: true };
}
