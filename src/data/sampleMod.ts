// Sample mod and demo vanilla files for instant testing in the browser

export const DEMO_EVENTS_YML = `l_english:
 # Демонстрационный мод: строки специально содержат всё, что ломает машинный перевод.
 demo.1.t:0 "Rearm $STATE$"
 demo.1.d:0 "Our advisors in $STATE$ report that [GetPlayer.GetTag] is ready to expand. £army_experience|1 will be spent."
 demo.1.a:0 "§YApprove§! the plan"
 demo.1.b:0 "§RRefuse§! and wait"
 demo.2.t:0 "The Day of Infamy"
 demo.2.d:0 "Our diplomats call it \\"an incident\\".\\nThe press calls it war."
 demo.2.a:0 "Mobilise the Navy"
`;

export const DEMO_UNITS_YML = `l_english:
 infantry_division:0 "Infantry Division"
 armored_division:0 "Armored Division"
 demo_units_title:0 "§GArmy of the People§!"
`;

export const DEMO_GLOSSARY_TSV = `# Пример глоссария HoI4 Localization Tool.
# Термин<TAB>перевод. Регистр не важен, совпадения только целыми словами.
Division\tДивизия
Infantry\tПехотная
Soviet Union\tСоветский Союз
United States\tСоединённые Штаты
Political Power\tПолитическая власть
World Tension\tМировая напряжённость
War Support\tПоддержка войны
Stability\tСтабильность
Focus Tree\tДерево фокусов
`;

export const DEMO_VANILLA_EN = `l_english:
 infantry_division:0 "Infantry Division"
 armored_division:0 "Armored Division"
`;

export const DEMO_VANILLA_RU = `l_russian:
 infantry_division:0 "Пехотная дивизия"
 armored_division:0 "Танковая дивизия"
`;
