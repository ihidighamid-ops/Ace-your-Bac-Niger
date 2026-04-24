'use strict';

const tools = [
  // ─── BAC ───
  { id:1,  nom:'BacDefi',        icone:'🏆', accent:'#EA580C', gradient:'linear-gradient(135deg,#f97316,#ea580c)', description:'Epreuves et corriges officiels du BAC. 15 ans de vrais sujets !',        conseil:'Commence par les 3 dernieres annees !', categorie:'bac',         url:'https://epreuvesetcorriges.com' },
  { id:2,  nom:'BacBoost',       icone:'⚡', accent:'#2563EB', gradient:'linear-gradient(135deg,#3b82f6,#2563eb)', description:'Sujets BAC Terminale D corriges et classes par theme.',                    conseil:'2 sujets par semaine avec chrono = succes !', categorie:'bac',     url:'https://skaylab.com' },
  { id:3,  nom:'Bac Pro',        icone:'🚀', accent:'#16A34A', gradient:'linear-gradient(135deg,#22c55e,#16a34a)', description:'Plateforme BAC Afrique francophone. Cours et sujets complets.',           conseil:'Classe par theme, les patterns se repetent !', categorie:'bac',   url:'https://sunudaara.com' },
  { id:4,  nom:'Base Epreuves',  icone:'📚', accent:'#7C3AED', gradient:'linear-gradient(135deg,#8b5cf6,#7c3aed)', description:'Banque complete des epreuves officielles. Tout classe, tout dispo.',     conseil:'La ressource la plus complete pour le BAC !', categorie:'bac',    url:'https://banquedesepreuves.com' },
  // ─── COURS ───
  { id:5,  nom:'MathPulse',      icone:'📐', accent:'#E11D48', gradient:'linear-gradient(135deg,#f43f5e,#e11d48)', description:'Cours et exercices Maths Terminale Afrique. Fiches completes.',          conseil:'Fiches la veille de lexamen, parfait !', categorie:'cours',        url:'https://mathprepa.app' },
  { id:6,  nom:'SigmaCours',     icone:'🧮', accent:'#7C3AED', gradient:'linear-gradient(135deg,#8b5cf6,#7c3aed)', description:'Maths Afrique francophone. Cours et exercices progressifs.',             conseil:'30 min/jour = +5 points au BAC. Prouve !', categorie:'cours',       url:'https://sigmaths.net' },
  { id:7,  nom:'EcoleVideo',     icone:'🎬', accent:'#D97706', gradient:'linear-gradient(135deg,#f59e0b,#d97706)', description:'Videos educatives par des profs africains. Toutes matieres.',            conseil:'1 video + 3 exercices = memorisation parfaite !', categorie:'cours', url:'https://ecolesausenegal.com' },
  { id:8,  nom:'Hist-Geo',       icone:'🗺️', accent:'#65A30D', gradient:'linear-gradient(135deg,#84cc16,#65a30d)', description:'Histoire-Geographie CEDEAO. Cartes, chronologies et dissertations.',    conseil:'Apprends par theme, ta memoire dit merci !', categorie:'cours',    url:'https://clubcedeao.com' },
  // ─── GENERAL ───
  { id:9,  nom:'Smart Tle',      icone:'🌟', accent:'#16A34A', gradient:'linear-gradient(135deg,#22c55e,#16a34a)', description:'Meilleure plateforme mondiale Maths et Sciences en francais !',         conseil:'Sadapte a ton niveau, travaille et progresse !', categorie:'general', url:'https://fr.khanacademy.org' },
  { id:10, nom:'ASP Reussite',   icone:'🎯', accent:'#0369A1', gradient:'linear-gradient(135deg,#0ea5e9,#0369a1)', description:'Assistance scolaire professionnelle. Methodes et conseils experts.',     conseil:'Les methodes font la difference !', categorie:'general',          url:'https://assistancescolaire.com' },
  { id:11, nom:'PhiloClair',     icone:'🦁', accent:'#B45309', gradient:'linear-gradient(135deg,#f59e0b,#b45309)', description:'Cours Philo BAC complets. Dissertations et auteurs cles.',              conseil:'10 citations = tu peux les glisser partout !', categorie:'general', url:'https://philosophie.ac-paris.fr' },
  // ─── BIBLIOTHEQUE ───
  { id:12, nom:'Afrique Ligne',  icone:'🌍', accent:'#EA580C', gradient:'linear-gradient(135deg,#f97316,#ea580c)', description:'Litterature africaine. Oeuvres et analyses completes.',                 conseil:'TON heritage, lis avec fierte !', categorie:'bibliotheque',        url:'https://liretama.com' },
  { id:13, nom:'Mes Livres',     icone:'📖', accent:'#A16207', gradient:'linear-gradient(135deg,#eab308,#a16207)', description:'Bibliotheque africaine numerique. Cours et livres scolaires.',          conseil:'Telecharge les ressources dont tu as besoin !', categorie:'bibliotheque', url:'https://kamerpower.com' },
  { id:14, nom:'Afro Read',      icone:'📕', accent:'#047857', gradient:'linear-gradient(135deg,#10b981,#047857)', description:'Bibliotheque mondiale, des milliers d ouvrages en francais.',           conseil:'Les classiques africains y sont tous !', categorie:'bibliotheque',   url:'https://babelio.com' },
  { id:15, nom:'AfroClassiques', icone:'📜', accent:'#78716C', gradient:'linear-gradient(135deg,#a8a29e,#78716c)', description:'Mongo Beti, Hampate Ba, Kourouma. Grands auteurs africains.',            conseil:'Reviennent CHAQUE annee au BAC Serie A !', categorie:'bibliotheque', url:'https://afrolivresque.com' },
  // ─── IA ───
  { id:16, nom:'prof-bot 🤖',    icone:'🧠', accent:'#6366F1', gradient:'linear-gradient(135deg,#818cf8,#6366f1)', description:'IA ultra-puissante qui repond a toutes tes questions de cours 24h/24 !', conseil:'Pose n importe quelle question du programme BAC !', categorie:'ia', url:'https://lmarena.ai' }
];

module.exports = tools;
