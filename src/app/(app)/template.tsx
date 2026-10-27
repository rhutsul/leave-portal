// Новий вміст сторінки з'являється з підйомом на 6 px і проявленням (DESIGN.md, розділ 11). template.tsx
// перемонтовується лише при переході між розділами: зміна ?record= чи ?year= на тій самій сторінці не анімує.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="flex animate-page-in flex-col gap-6">{children}</div>;
}
