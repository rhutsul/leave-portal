# Дельта: leave-balance

## MODIFIED Requirements

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

## ADDED Requirements

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
