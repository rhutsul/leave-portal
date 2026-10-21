# leave-balance Specification

## Purpose
Рахує працівнику залишки «Sick leave» і «Personal leave» за навчальний рік із погоджених записів — однаково для цілих
днів і годин — і попереджає працівника та менеджера, коли запис перевищує залишок, пропонуючи розподіл на оплачувану й
неоплачувану частини.

## Requirements

### Requirement: Перегляд залишків

The system SHALL показувати працівнику для «Sick leave» і «Personal leave» надано, перенесено, використано й залишок за навчальний рік, а для «Unpaid leave» і «Family celebration» — лише використано.

#### Scenario: AC-BALANCE-01 Залишки без записів

- **GIVEN** працівник без погоджених записів у навчальному році 2026–2027 і без перенесених днів
- **WHEN** працівник переглядає свої залишки
- **THEN** працівник бачить: «Sick leave» — granted 18.00, used 0.00, remaining 18.00; «Personal leave» — granted 18.00, used 0.00, remaining 18.00
- **AND** «Unpaid leave» і «Family celebration» — лише used 0.00

### Requirement: Залишок зменшують лише погоджені записи

The system SHALL зараховувати у використане лише записи зі статусом «Approved»; записи з іншими статусами залишок не змінюють.

#### Scenario: AC-BALANCE-02 Погоджено цілий день

- **GIVEN** працівник із залишком «Sick leave» 18.00 і основною посадою з розкладом Tue 08:30–15:30
- **WHEN** менеджер погоджує запис «Sick leave» на цілий день 2026-11-03
- **THEN** used 1.00, remaining 17.00

#### Scenario: AC-BALANCE-04 Запис чекає рішення

- **GIVEN** працівник із залишком «Personal leave» 18.00 і записом «Personal leave» на цілий день зі статусом «Awaiting decision»
- **WHEN** працівник переглядає свої залишки
- **THEN** «Personal leave» — used 0.00, remaining 18.00

#### Scenario: AC-BALANCE-07 Запис відхилено

- **GIVEN** працівник із залишком «Sick leave» 18.00 і записом «Sick leave» на цілий день зі статусом «Awaiting decision»
- **WHEN** менеджер відхиляє цей запис
- **THEN** «Sick leave» — used 0.00, remaining 18.00

### Requirement: Частка дня

The system SHALL рахувати частку дня як хвилини запису ÷ усі робочі хвилини працівника цієї дати за розкладами всіх його посад: записи, що разом покривають усі ці хвилини, дають 1.00, цілий день лише однієї з кількох посад — свою частку; частку кожної дати округлювати до 2 знаків половиною вгору (0.355 → 0.36) і не рахувати одну дату більше ніж 1.00.

#### Scenario: AC-BALANCE-03 Частина дня на одній посаді

- **GIVEN** працівник із залишком «Sick leave» 18.00 і єдиною посадою з розкладом Tue 08:30–15:30 (7 h)
- **WHEN** менеджер погоджує запис «Sick leave» на 2026-11-03 з 09:00 до 11:30 (2 h 30 min)
- **THEN** used 0.36 (150 min of 420 min), remaining 17.64

#### Scenario: AC-BALANCE-05 Цілий день на двох посадах

- **GIVEN** працівник з основною посадою (Mon 08:30–15:30) і додатковою посадою (Mon 15:45–17:00)
- **WHEN** менеджери погоджують обидва записи «Personal leave» на цілий день 2026-11-02
- **THEN** used 1.00, а не 2.00

#### Scenario: AC-BALANCE-06 Цілий день лише на додатковій посаді

- **GIVEN** працівник з основною посадою (Mon 08:30–15:30, 420 min) і додатковою посадою (Mon 15:45–17:00, 75 min)
- **WHEN** менеджер погоджує запис «Personal leave» на цілий день лише для додаткової посади 2026-11-02
- **THEN** used 0.15 (75 min of the employee's 495 working minutes that day)

### Requirement: Перенесення на наступний навчальний рік

WHEN починається новий навчальний рік (1 вересня), the system SHALL переносити невикористані дні «Sick leave» і «Personal leave» з попереднього навчального року повністю, без обмеження, і перераховувати перенесені дні, коли запис попереднього навчального року погоджено пізніше.

#### Scenario: AC-BALANCE-11 Перенесення 5 днів

- **GIVEN** працівник, у якого на 2027-08-31 лишилось 5.00 днів «Sick leave» з навчального року 2026–2027
- **WHEN** працівник переглядає свої залишки 2027-09-01
- **THEN** «Sick leave» у навчальному році 2027–2028 — granted 18.00, carried over 5.00, remaining 23.00

### Requirement: Попередження працівнику про перевищення

IF заявка працівника разом перевищує залишок на момент подання, THEN the system SHALL створити заявку й показати працівнику одне попередження на суму всієї заявки — із залишком і частиною, яку буде враховано як «Unpaid leave».

#### Scenario: AC-BALANCE-08 Цілий день при залишку 0.50

- **GIVEN** працівник із залишком «Personal leave» 0.50 і посадою з розкладом Tue 08:30–15:30
- **WHEN** працівник просить «Personal leave» на цілий день 2026-11-03
- **THEN** заявку створено
- **AND** працівник бачить попередження "Your Personal leave balance is 0.50 day. Another 0.50 day will be counted as Unpaid leave"

#### Scenario: AC-BALANCE-15 Частина дня при залишку 0.20

- **GIVEN** працівник, у якого «Personal leave» показує remaining 0.20, і єдина посада з розкладом Tue 08:30–15:30 (420 min)
- **WHEN** працівник просить «Personal leave» на 2026-11-03 з 09:00 до 11:30 (0.36 day)
- **THEN** заявку створено
- **AND** працівник бачить попередження "Your Personal leave balance is 0.20 day. Another 0.16 day will be counted as Unpaid leave"

#### Scenario: AC-BALANCE-17 Одне попередження на заявку з трьох днів

- **GIVEN** працівник, у якого «Personal leave» показує remaining 1.50, і посада з розкладом Mon–Fri 08:30–15:30
- **WHEN** працівник просить «Personal leave» на цілі дні 2026-11-02, 2026-11-03 і 2026-11-04 однією заявкою
- **THEN** заявку створено
- **AND** працівник бачить одне попередження "Your Personal leave balance is 1.50 day. Another 1.50 day will be counted as Unpaid leave"

### Requirement: Попередження й розподіл для менеджера

IF запис перевищує залишок працівника на момент, коли менеджер відкриває запис, з урахуванням погоджень між тим, THEN the system SHALL показати менеджеру попередження з цим залишком і пропонований розподіл: оплачувана частина до залишку, решта — «Unpaid leave».

#### Scenario: AC-BALANCE-09 Менеджер відкриває запис понад залишок

- **GIVEN** запис «Personal leave» на цілий день зі статусом «Awaiting decision» працівника, у якого «Personal leave» показує used 17.50, remaining 0.50
- **WHEN** менеджер відкриває запис
- **THEN** менеджер бачить попередження "This request exceeds the Personal leave balance (0.50 day). Suggested: 0.50 day Personal leave, 0.50 day Unpaid leave"

#### Scenario: AC-BALANCE-14 Залишок після погодження іншого запису

- **GIVEN** працівник, у якого «Personal leave» показує remaining 1.50, посада з розкладом Mon–Fri 08:30–15:30 і два записи «Personal leave» на цілий день 2026-11-03 і 2026-11-04 зі статусом «Awaiting decision»
- **WHEN** менеджер погоджує запис 2026-11-03, а потім відкриває запис 2026-11-04
- **THEN** менеджер бачить попередження "This request exceeds the Personal leave balance (0.50 day). Suggested: 0.50 day Personal leave, 0.50 day Unpaid leave"

### Requirement: Погодження з розподілом

WHEN менеджер погоджує запис понад залишок із пропонованим розподілом, the system SHALL визначити розподіл за залишком на момент рішення, з урахуванням погоджень після відкриття запису, і зарахувати оплачувану частину у використане відповідного типу, а решту — у використане «Unpaid leave».

#### Scenario: AC-BALANCE-10 Погоджено з розподілом

- **GIVEN** запис з AC-BALANCE-09 і «Unpaid leave» працівника used 0.00
- **WHEN** менеджер погоджує його з пропонованим розподілом
- **THEN** «Personal leave» — used 18.00, remaining 0.00
- **AND** «Unpaid leave» — used 0.50

### Requirement: Погодження понад залишок без розподілу

IF менеджер намагається погодити запис понад залишок повністю як оплачувану відпустку без розподілу, THEN the system SHALL не погоджувати запис і показати повідомлення, що можна лише погодити з пропонованим розподілом або відхилити.

#### Scenario: AC-BALANCE-16 Спроба погодити без розподілу

- **GIVEN** запис з AC-BALANCE-09
- **WHEN** менеджер намагається погодити його повністю як «Personal leave» без розподілу
- **THEN** запис не погоджено
- **AND** менеджер бачить повідомлення "The Personal leave balance is 0.50 day: approve with the suggested split or reject"

### Requirement: Чужі залишки

The system SHALL показувати повний залишок працівника йому самому, відповідальному менеджеру будь-якої з його посад — ті самі числа, що бачить працівник, — і адміністратору, і не показувати його іншим працівникам та менеджерам, які не керують жодною з посад працівника.

#### Scenario: AC-BALANCE-12 Менеджер чужих посад

- **GIVEN** працівник teacher1@example.test не має посад, якими керує manager1@example.test
- **WHEN** manager1@example.test намагається переглянути залишки teacher1@example.test
- **THEN** залишки не показано

#### Scenario: AC-BALANCE-13 Працівник дивиться чужі залишки

- **GIVEN** працівник teacher1@example.test
- **WHEN** teacher1@example.test намагається переглянути залишки іншого працівника
- **THEN** залишки не показано

#### Scenario: AC-BALANCE-20 Менеджер додаткової посади бачить повний залишок

- **GIVEN** teacher1@example.test використав 2.00 дня «Personal leave» на основній посаді (manager1@example.test) і має додаткову посаду, якою керує manager2@example.test
- **WHEN** manager2@example.test переглядає залишки teacher1@example.test
- **THEN** «Personal leave» показує used 2.00, remaining 16.00 — те саме, що бачить teacher1@example.test

### Requirement: Запис після погодження з розподілом

WHEN менеджер погоджує запис із розподілом, the system SHALL лишити один запис зі своїм типом відпустки й статусом «Approved», показати на ньому розподіл «<оплачувана частина> <тип> + <неоплачувана частина> Unpaid leave» і зарахувати обидві частини в залишки відповідних типів.

#### Scenario: AC-BALANCE-18 Один запис із розподілом у «My requests»

- **GIVEN** запис з AC-BALANCE-10, погоджений із розподілом
- **WHEN** працівник відкриває «My requests»
- **THEN** є один запис із типом «Personal leave», статусом «Approved» і розподілом "0.50 Personal leave + 0.50 Unpaid leave"

#### Scenario: AC-BALANCE-19 Розподіл при нульовому залишку

- **GIVEN** запис «Personal leave» на цілий день зі статусом «Awaiting decision» працівника, у якого «Personal leave» показує remaining 0.00, а «Unpaid leave» — used 0.00
- **WHEN** менеджер погоджує його з пропонованим розподілом
- **THEN** запис зберігає тип «Personal leave» з розподілом "0.00 Personal leave + 1.00 Unpaid leave"
- **AND** «Unpaid leave» показує used 1.00

### Requirement: Навчальний рік дати запису

The system SHALL зараховувати погоджений запис у використане того навчального року, до якого належить дата запису, хоч би коли його погоджено, тож заявка на дати двох навчальних років зменшує залишок кожного з них.

#### Scenario: AC-BALANCE-21 Пізнє погодження запису минулого навчального року

- **GIVEN** працівник, у якого лишилось 5.00 днів «Sick leave» у навчальному році 2026–2027, і запис «Sick leave» на цілий день 2027-08-30 зі статусом «Awaiting decision»
- **WHEN** менеджер погоджує його 2027-09-02
- **THEN** «Sick leave» 2026–2027 показує remaining 4.00
- **AND** 2027–2028 показує carried over 4.00, remaining 22.00

#### Scenario: AC-BALANCE-22 Заявка на дати двох навчальних років

- **GIVEN** працівник із посадою, у розкладі якої є 2027-08-31 і 2027-09-01
- **WHEN** менеджер погоджує обидва записи «Personal leave» на цілий день однієї заявки на ці дві дати
- **THEN** «Personal leave» показує used на 1.00 більше в навчальному році 2026–2027
- **AND** used на 1.00 більше в навчальному році 2027–2028
