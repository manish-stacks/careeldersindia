/** Templates digitised from the paper sheets: "Daily Services Entry Sheet" + "Blood Haemotology Report". */
const DAILY_SERVICES = [
  'GRBS', 'ABG', 'IV Cannulation', 'Cardiac Monitor', 'HFNC', 'Ryles Tube Insertion', "Foley's Insertion", 'Alpha Bed', 'DVT Pump',
  'Oxygen Admin', 'Bair Hugger', 'Syringe Pump', 'Infusion Pump', 'IABP', 'Arterial Line Insertion', 'CVP / HD Cath Insertion', 'Ventilator',
  'Intubation', 'Steam Inhalation', 'Dialysis / Peritoneal', 'Pig Tail', 'Tracheostomy', 'ICD Insertion', 'Nebulization', 'CPAP / BiPAP',
  'Perma Cath', 'ECG',
];

const HAEMATOLOGY_PARAMS = [
  ['hgb', 'HGB'], ['hct', 'HCT'], ['rbc', 'RBC Count'], ['platelet', 'Platelet Count'], ['retic', 'Retic Count'], ['tlc', 'TLC'],
  ['diff', 'Diff Count'], ['neutrophils', 'Neutrophils'], ['lymphocytes', 'Lymphocytes'], ['eosinophils', 'Eosinophils'], ['basophils', 'Basophils'],
  ['monocytes', 'Monocytes'], ['blood_parasites', 'Blood Parasites'], ['wbc_precursor', 'WBC Precursor'], ['rbc_precursor', 'RBC Precursor'],
  ['others', 'Others'], ['esr', 'ESR'], ['bt', 'B.T'], ['ct', 'C.T'], ['pt', 'P.T'], ['fdp', 'FDP'], ['aptt', 'APTT'], ['tt', 'TT'], ['morphology', 'Morphology'],
].map(([key, label]) => ({ key, label }));

const LAB_PANELS = { NONE: [], HAEMATOLOGY: HAEMATOLOGY_PARAMS };
module.exports = { DAILY_SERVICES, HAEMATOLOGY_PARAMS, LAB_PANELS };
