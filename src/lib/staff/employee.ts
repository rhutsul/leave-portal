// Керування працівниками (вимога PM 07, openspec/changes/impl-staff-management/design.md D3, D4, D10): тексти, статуси,
// ролі й перевірка введення. Право й остаточні правила — у функціях бази (міграція 20261125082128_staff_management.sql);
// тут — ті самі перевірки до відправки, щоб людина бачила помилку під полем, і переклад відповіді бази.

/** Тексти PM — дослівно з AC; тексти розробника — з функцій бази (D4), щоб людина бачила те саме. */
export const STAFF_MESSAGES = {
  // AC-STAFF-13
  notAdmin: "Only an administrator can manage employees",
  // AC-STAFF-18
  ownRole: "You cannot change your own role",
  // AC-STAFF-12
  adminChangesNames: "Only an administrator can change names and emails",
  // AC-STAFF-08
  deactivated: "Your account is deactivated. Contact the administrator",
  // Розробник (D4)
  nameInvalid: "Enter a name of up to 200 characters",
  emailInvalid: "Enter a valid email",
  emailTaken: "An employee with this email already exists",
  failed: "The change was not saved. Please try again.",
} as const;

export type EmployeeStatus = "invited" | "active" | "deactivated";

/** «Invited», «Active» — з AC-STAFF-01, -02; «Deactivated» — з глосарію PM («Deactivated employee»), D3. */
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  invited: "Invited",
  active: "Active",
  deactivated: "Deactivated",
};

export function isEmployeeStatus(value: string): value is EmployeeStatus {
  return Object.hasOwn(EMPLOYEE_STATUS_LABELS, value);
}

export type Role = "employee" | "manager" | "admin";

/** Ролі в порядку матриці прав requirements/product.md. */
export const ROLES: { value: Role; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Administrator" },
];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.some((r) => r.value === value);
}

export function roleLabel(role: string): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

export type EmployeeFields = { name: string; email: string };
export type EmployeeErrors = { name: string | null; email: string | null };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Ім'я й email з форми: краї обрізано, email — у нижньому регістрі (як private.clean_email). */
export function readEmployeeFields(form: FormData): EmployeeFields {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  return { name: text("full_name"), email: text("email").toLowerCase() };
}

/** Ті самі правила, що private.clean_full_name і private.clean_email у базі. */
export function employeeFieldErrors({ name, email }: EmployeeFields): EmployeeErrors {
  return {
    name: name === "" || [...name].length > 200 ? STAFF_MESSAGES.nameInvalid : null,
    email: email.length > 254 || !EMAIL.test(email) ? STAFF_MESSAGES.emailInvalid : null,
  };
}

export function hasErrors(errors: Record<string, string | null>): boolean {
  return Object.values(errors).some((e) => e != null);
}

/** Відповідь бази — лише код і текст. */
export type DbFailure = { code?: string | null; message?: string | null };

/**
 * Відмова функції бази → текст для людини. 42501 — без права (AC-STAFF-13); P0001 — тексти PM і розробника з
 * функцій (вони вже для людини); решта — загальний текст без подробиць бази.
 */
export function messageOfDbError(error: DbFailure): string {
  if (error.code === "42501") return STAFF_MESSAGES.notAdmin;
  if (error.code === "P0001" && error.message) return error.message;
  return STAFF_MESSAGES.failed;
}

/** До якого поля належить текст бази: ім'я, email — під полем; решта — над формою. */
export function fieldOfMessage(message: string): keyof EmployeeErrors | null {
  if (message === STAFF_MESSAGES.nameInvalid) return "name";
  if (message === STAFF_MESSAGES.emailInvalid || message === STAFF_MESSAGES.emailTaken) return "email";
  return null;
}

/** uuid з форми чи адреси: лише справжній uuid, інакше — як «немає такого». */
export function uuidOf(raw: unknown): string | null {
  return typeof raw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw.toLowerCase()
    : null;
}

/** Посилання, яке щойно видала база: токен живе лише у відповіді дії й на екрані адміністратора (D2). */
export type IssuedLink = { employeeId: string; email: string; token: string; validUntil: string };

/** Що повертають дії сторінок працівників: помилки полів, помилка всієї дії, успіх і видане посилання. */
export type StaffActionState = { errors: EmployeeErrors; message: string; done: boolean; link: IssuedLink | null };

export const INITIAL_STAFF_STATE: StaffActionState = {
  errors: { name: null, email: null },
  message: "",
  done: false,
  link: null,
};
