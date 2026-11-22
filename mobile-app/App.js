import React, { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

const COLORS = {
  ink: '#183B3D', deep: '#123638', teal: '#237F78', tealDark: '#176A64',
  mint: '#E7F3F0', canvas: '#F4F7F6', white: '#FFFFFF', line: '#E6ECEA',
  muted: '#839391', body: '#506663', green: '#4E9279', amber: '#B47D4C', red: '#BB6C66',
};
const TUNIS = { latitude: 36.8065, longitude: 10.1815, latitudeDelta: 0.105, longitudeDelta: 0.105 };
const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
const CHAT_API_BASE_URL = (process.env.EXPO_PUBLIC_CHAT_API_URL
  || (Platform.OS === 'web' ? 'http://127.0.0.1:8000' : metroHost ? `http://${metroHost}:8000` : 'http://127.0.0.1:8000')).replace(/\/+$/, '');
const APPOINTMENT_SLOTS = ['Today · 14:30', 'Tomorrow · 09:00', 'Tomorrow · 11:30', 'Friday · 15:30'];
const ACCOUNT_INDEX_KEY = 'careway.account-ids.v1';
const ACCOUNT_KEY_PREFIX = 'careway.account.';
const DEMO_DOCTORS = [
  { id: 'demo-1', name: 'Dr. Leila Ben Salem', specialty: 'Cardiology', clinic: 'Clinique El Manar', address: 'Avenue de la Liberté, El Manar 1', latitude: 36.8362, longitude: 10.1657, demo: true, slots: APPOINTMENT_SLOTS },
  { id: 'demo-2', name: 'Dr. Youssef Trabelsi', specialty: 'General practice', clinic: 'Cabinet Dr. Trabelsi', address: 'Rue de Marseille, Centre Ville', latitude: 36.8027, longitude: 10.1814, demo: true, slots: APPOINTMENT_SLOTS },
  { id: 'demo-3', name: 'Dr. Mariem Gharbi', specialty: 'Dermatology', clinic: 'Centre Médical Lafayette', address: 'Avenue Hédi Nouira, Lafayette', latitude: 36.8125, longitude: 10.1767, demo: true, slots: APPOINTMENT_SLOTS },
  { id: 'demo-4', name: 'Dr. Sami Khemiri', specialty: 'Pediatrics', clinic: 'Cabinet Ennasr Santé', address: 'Rue du Lac, Les Berges du Lac', latitude: 36.8434, longitude: 10.2778, demo: true, slots: APPOINTMENT_SLOTS },
  { id: 'demo-5', name: 'Dr. Amel Jaziri', specialty: 'Ophthalmology', clinic: 'Centre Ophtalmologique Tunis', address: 'Rue Ibn Khaldoun, Bab Bhar', latitude: 36.7988, longitude: 10.1742, demo: true, slots: APPOINTMENT_SLOTS },
];
const SPECIALTIES = ['All specialties', 'Cardiology', 'General practice', 'Dermatology', 'Pediatrics', 'Ophthalmology', 'Psychiatry'];
const COPY = {
  en: {
    signIn: 'Sign in', careCloser: 'CARE, CLOSER TO YOU', signInSubtitle: 'Find care and manage your appointments.', phone: 'Phone number', phoneHint: 'Enter 8 digits', password: 'Password', passwordPlaceholder: 'Your password', forgot: 'Forgot password?', createPatient: 'Create a patient account', newToCareway: 'New to Careway?', pilotPatient: 'Tunis pilot · Patient access',
    createAccount: 'Create patient account', signupSubtitle: 'We only ask for information needed to set up your account. You can add health details later if needed.', accountFor: 'Who is this account for?', myself: 'Myself', minor: 'A minor', caregiver: 'Someone I support', fullName: 'Full name', yourName: 'Your full name', dob: 'Date of birth', yourDob: 'Your date of birth', datePlaceholder: 'Choose date of birth', patientName: 'Patient’s full name', patientDob: 'Patient’s date of birth', relationship: 'Your relationship to the patient', authority: 'Your authority', guardian: 'Parent or legal guardian', caregiverPlaceholder: 'Authorized caregiver', phoneSignup: 'Phone number', emailOptional: 'Email address (optional)', emailPlaceholder: 'you@example.com', passwordCreate: 'Create a password', confirmPassword: 'Confirm password', language: 'Language', terms: 'I agree to the Terms and Privacy Notice.', marketing: 'I’d like to receive optional product and health service updates.', signupHelper: 'You can change optional communication preferences later. We do not request medical history during signup.', termsRequired: 'Please agree to the Terms and Privacy Notice to create an account.', createButton: 'Create patient account', alreadyRegistered: 'Already registered?',
    passwordWeak: 'Weak', passwordGood: 'Good', passwordPerfect: 'Perfect', passwordWeakHint: 'Use at least 8 characters with uppercase, lowercase, and a number.', passwordGoodHint: 'Good start. Add 12+ characters and a symbol for a stronger password.', passwordPerfectHint: 'Strong mix and length. Avoid reusing this password.', passwordEmpty: 'Password strength', passwordSecurityNote: 'This is a strength estimate, not a guarantee against cyberattacks.',
    errRequired: 'Complete all required fields before continuing.', errDob: 'Choose a valid date of birth.', errPhone: 'Enter exactly 8 digits for your Tunisian phone number.', errEmail: 'Enter a valid email address or leave it blank.', errPassword: 'Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.', errMatch: 'The passwords do not match.', errAdult: 'For someone under 18, choose “A minor” and enter an adult guardian’s details.', errPatientDetails: 'Enter the patient’s name, date of birth, and your relationship or authority.', errGuardianAge: 'The parent, guardian, or caregiver creating this account must be an adult.', errMinorAge: 'The patient’s date of birth must indicate they are under 18.', errGuardianAuthority: 'Confirm that you are the patient’s parent or legal guardian.', errCareAuthority: 'Confirm that you are authorized to manage this patient’s account.', errDuplicate: 'We couldn’t create an account with these details. Try signing in or recovering access.', errSignIn: 'We couldn’t sign you in with those details. Check them or recover access.', errRateLimit: 'Too many attempts. Please wait a moment, then try again.', errLoginRequired: 'Enter your phone number and password.', errRecoveryPhone: 'Enter exactly 8 digits for your Tunisian phone number.', recoveryTitle: 'Recover access', recoverySubtitle: 'Enter your phone number. If an account matches, recovery instructions will be sent.', recoveryGeneric: 'If an account matches those details, recovery instructions will be sent.', continue: 'Continue', backSignIn: '‹  Back to sign in',
    homeEyebrow: 'HEALTHCARE, MADE CLOSER', findDoctor: 'Find a doctor', searchPlaceholder: 'Doctor name or specialty', allSpecialties: 'All specialties', map: 'Map', list: 'List', findingYou: 'Finding you…', nearLocation: 'Near your location', tunisLocation: 'Tunis, Tunisia', nearby: 'nearby', sortedDistance: '· sorted by distance', tunisPilot: 'TUNIS PILOT', noDoctors: 'No doctors found', tryAnotherSearch: 'Try a different name or specialty.', requestVisit: 'Request a visit', chooseTime: 'Choose time', appointments: 'Appointments', myAppointments: 'My appointments', yourCare: 'YOUR CARE', pendingConfirmation: 'Requests stay pending until the clinic confirms them.', noAppointments: 'No appointments yet', appointmentsAppear: 'Your appointment requests and confirmations will appear here.', findCare: 'Find care',
    recoveryNotice: 'If an account matches those details, recovery instructions will be sent.', patientRole: 'Patient', dateDone: 'Done', dateCancel: 'Cancel', appointmentRequestTitle: 'APPOINTMENT REQUEST', appointmentSelectTime: 'Choose an available time', appointmentDisclaimer: 'This sends a request to the clinic. It is not confirmed until the clinic responds. No symptoms or medical history are required.', appointmentSend: 'Send appointment request', appointmentSent: 'Your request was sent. It remains pending until the clinic confirms it.',
  },
  fr: {
    signIn: 'Se connecter', careCloser: 'LES SOINS, PLUS PROCHES', signInSubtitle: 'Trouvez des soins et gérez vos rendez-vous.', phone: 'Numéro de téléphone', phoneHint: 'Saisissez 8 chiffres', password: 'Mot de passe', passwordPlaceholder: 'Votre mot de passe', forgot: 'Mot de passe oublié ?', createPatient: 'Créer un compte patient', newToCareway: 'Nouveau sur Careway ?', pilotPatient: 'Pilote de Tunis · Accès patient',
    createAccount: 'Créer un compte patient', signupSubtitle: 'Nous demandons uniquement les informations nécessaires à la création du compte. Vous pourrez ajouter des informations de santé plus tard.', accountFor: 'Pour qui est ce compte ?', myself: 'Pour moi', minor: 'Un mineur', caregiver: 'Une personne que j’aide', fullName: 'Nom complet', yourName: 'Votre nom complet', dob: 'Date de naissance', yourDob: 'Votre date de naissance', datePlaceholder: 'Choisir la date de naissance', patientName: 'Nom complet du patient', patientDob: 'Date de naissance du patient', relationship: 'Votre lien avec le patient', authority: 'Votre autorisation', guardian: 'Parent ou tuteur légal', caregiverPlaceholder: 'Aidant autorisé', phoneSignup: 'Numéro de téléphone', emailOptional: 'Adresse e-mail (facultatif)', emailPlaceholder: 'vous@exemple.com', passwordCreate: 'Créer un mot de passe', confirmPassword: 'Confirmer le mot de passe', language: 'Langue', terms: 'J’accepte les Conditions et la Notice de confidentialité.', marketing: 'Je souhaite recevoir des actualités facultatives sur les produits et services de santé.', signupHelper: 'Vous pourrez modifier vos préférences de communication. Aucun historique médical n’est demandé à l’inscription.', termsRequired: 'Veuillez accepter les Conditions et la Notice de confidentialité.', createButton: 'Créer le compte patient', alreadyRegistered: 'Déjà inscrit ?',
    passwordWeak: 'Faible', passwordGood: 'Bien', passwordPerfect: 'Excellent', passwordWeakHint: 'Utilisez 8 caractères minimum, avec majuscule, minuscule et chiffre.', passwordGoodHint: 'Bon début. Ajoutez 12 caractères et un symbole pour le renforcer.', passwordPerfectHint: 'Bonne longueur et variété. Évitez de réutiliser ce mot de passe.', passwordEmpty: 'Sécurité du mot de passe', passwordSecurityNote: 'Cette estimation ne garantit pas une protection contre les cyberattaques.',
    errRequired: 'Complétez tous les champs obligatoires.', errDob: 'Choisissez une date de naissance valide.', errPhone: 'Saisissez exactement 8 chiffres pour votre numéro tunisien.', errEmail: 'Saisissez une adresse e-mail valide ou laissez le champ vide.', errPassword: 'Utilisez au moins 8 caractères avec une majuscule, une minuscule et un chiffre.', errMatch: 'Les mots de passe ne correspondent pas.', errAdult: 'Pour une personne de moins de 18 ans, choisissez « Un mineur » et indiquez les coordonnées d’un adulte.', errPatientDetails: 'Saisissez le nom, la date de naissance du patient et votre lien ou autorisation.', errGuardianAge: 'Le parent, tuteur ou aidant qui crée le compte doit être adulte.', errMinorAge: 'La date de naissance du patient doit indiquer qu’il a moins de 18 ans.', errGuardianAuthority: 'Confirmez que vous êtes le parent ou tuteur légal du patient.', errCareAuthority: 'Confirmez que vous êtes autorisé à gérer le compte de ce patient.', errDuplicate: 'Impossible de créer un compte avec ces informations. Essayez de vous connecter ou de récupérer l’accès.', errSignIn: 'Connexion impossible avec ces informations. Vérifiez-les ou récupérez l’accès.', errRateLimit: 'Trop de tentatives. Patientez un instant avant de réessayer.', errLoginRequired: 'Saisissez votre numéro de téléphone et votre mot de passe.', errRecoveryPhone: 'Saisissez exactement 8 chiffres pour votre numéro tunisien.', recoveryTitle: 'Récupérer l’accès', recoverySubtitle: 'Saisissez votre numéro. Si un compte correspond, des instructions seront envoyées.', recoveryGeneric: 'Si un compte correspond, des instructions de récupération seront envoyées.', continue: 'Continuer', backSignIn: '‹  Retour à la connexion',
    homeEyebrow: 'LES SOINS, PLUS PROCHES', findDoctor: 'Trouver un médecin', searchPlaceholder: 'Nom ou spécialité du médecin', allSpecialties: 'Toutes spécialités', map: 'Carte', list: 'Liste', findingYou: 'Localisation…', nearLocation: 'Près de vous', tunisLocation: 'Tunis, Tunisie', nearby: 'à proximité', sortedDistance: '· triés par distance', tunisPilot: 'PILOTE DE TUNIS', noDoctors: 'Aucun médecin trouvé', tryAnotherSearch: 'Essayez un autre nom ou une autre spécialité.', requestVisit: 'Demander un rendez-vous', chooseTime: 'Choisir un horaire', appointments: 'Rendez-vous', myAppointments: 'Mes rendez-vous', yourCare: 'VOTRE SUIVI', pendingConfirmation: 'Les demandes restent en attente jusqu’à confirmation du cabinet.', noAppointments: 'Aucun rendez-vous', appointmentsAppear: 'Vos demandes et confirmations apparaîtront ici.', findCare: 'Trouver un médecin',
    recoveryNotice: 'Si un compte correspond, des instructions de récupération seront envoyées.', patientRole: 'Patient', dateDone: 'Terminé', dateCancel: 'Annuler', appointmentRequestTitle: 'DEMANDE DE RENDEZ-VOUS', appointmentSelectTime: 'Choisissez un horaire disponible', appointmentDisclaimer: 'La demande est envoyée au cabinet. Elle reste en attente jusqu’à sa confirmation. Aucun symptôme ni historique médical n’est requis.', appointmentSend: 'Envoyer la demande', appointmentSent: 'Votre demande a été envoyée. Elle reste en attente de confirmation.',
  },
  ar: {
    signIn: 'تسجيل الدخول', careCloser: 'رعاية أقرب إليك', signInSubtitle: 'ابحث عن الرعاية وأدر مواعيدك.', phone: 'رقم الهاتف', phoneHint: 'أدخل 8 أرقام', password: 'كلمة المرور', passwordPlaceholder: 'كلمة المرور', forgot: 'هل نسيت كلمة المرور؟', createPatient: 'إنشاء حساب مريض', newToCareway: 'هل أنت جديد في كيرواي؟', pilotPatient: 'تجربة تونس · دخول المريض',
    createAccount: 'إنشاء حساب مريض', signupSubtitle: 'نجمع المعلومات اللازمة لإنشاء الحساب فقط. يمكنك إضافة المعلومات الصحية لاحقًا عند الحاجة.', accountFor: 'لمن هذا الحساب؟', myself: 'لي', minor: 'قاصر', caregiver: 'شخص أعتني به', fullName: 'الاسم الكامل', yourName: 'اسمك الكامل', dob: 'تاريخ الميلاد', yourDob: 'تاريخ ميلادك', datePlaceholder: 'اختر تاريخ الميلاد', patientName: 'الاسم الكامل للمريض', patientDob: 'تاريخ ميلاد المريض', relationship: 'صلة القرابة بالمريض', authority: 'الصلاحية', guardian: 'ولي أو وصي قانوني', caregiverPlaceholder: 'مقدم رعاية معتمد', phoneSignup: 'رقم الهاتف', emailOptional: 'البريد الإلكتروني (اختياري)', emailPlaceholder: 'you@example.com', passwordCreate: 'إنشاء كلمة مرور', confirmPassword: 'تأكيد كلمة المرور', language: 'اللغة', terms: 'أوافق على الشروط وإشعار الخصوصية.', marketing: 'أرغب في تلقي تحديثات اختيارية عن المنتجات والخدمات الصحية.', signupHelper: 'يمكنك تغيير تفضيلات التواصل لاحقًا. لا نطلب السجل الطبي عند التسجيل.', termsRequired: 'يرجى الموافقة على الشروط وإشعار الخصوصية.', createButton: 'إنشاء حساب المريض', alreadyRegistered: 'لديك حساب بالفعل؟',
    passwordWeak: 'ضعيفة', passwordGood: 'جيدة', passwordPerfect: 'ممتازة', passwordWeakHint: 'استخدم 8 أحرف على الأقل مع حرف كبير وصغير ورقم.', passwordGoodHint: 'بداية جيدة. أضف 12 حرفًا ورمزًا لزيادة القوة.', passwordPerfectHint: 'طول وتنوع جيدان. لا تعِد استخدام كلمة المرور.', passwordEmpty: 'قوة كلمة المرور', passwordSecurityNote: 'هذا تقدير لقوة كلمة المرور ولا يضمن الحماية من الهجمات الإلكترونية.',
    errRequired: 'أكمل جميع الحقول المطلوبة.', errDob: 'اختر تاريخ ميلاد صحيحًا.', errPhone: 'أدخل 8 أرقام بالضبط لرقم الهاتف التونسي.', errEmail: 'أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.', errPassword: 'استخدم 8 أحرف على الأقل مع حرف كبير وصغير ورقم.', errMatch: 'كلمتا المرور غير متطابقتين.', errAdult: 'لمن هم دون 18 عامًا، اختر «قاصر» وأدخل بيانات شخص بالغ.', errPatientDetails: 'أدخل اسم المريض وتاريخ ميلاده وصلتك به أو صلاحيتك.', errGuardianAge: 'يجب أن يكون ولي الأمر أو مقدم الرعاية بالغًا.', errMinorAge: 'يجب أن يشير تاريخ ميلاد المريض إلى أنه دون 18 عامًا.', errGuardianAuthority: 'أكد أنك ولي الأمر أو الوصي القانوني للمريض.', errCareAuthority: 'أكد أن لديك صلاحية إدارة حساب هذا المريض.', errDuplicate: 'تعذر إنشاء الحساب بهذه البيانات. جرّب تسجيل الدخول أو استعادة الوصول.', errSignIn: 'تعذر تسجيل الدخول بهذه البيانات. تحقق منها أو استعد الوصول.', errRateLimit: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.', errLoginRequired: 'أدخل رقم الهاتف وكلمة المرور.', errRecoveryPhone: 'أدخل 8 أرقام بالضبط لرقم الهاتف التونسي.', recoveryTitle: 'استعادة الوصول', recoverySubtitle: 'أدخل رقم هاتفك. إذا تطابق مع حساب، فستُرسل تعليمات الاستعادة.', recoveryGeneric: 'إذا تطابق الرقم مع حساب، فستُرسل تعليمات الاستعادة.', continue: 'متابعة', backSignIn: '‹  العودة لتسجيل الدخول',
    homeEyebrow: 'رعاية أقرب إليك', findDoctor: 'ابحث عن طبيب', searchPlaceholder: 'اسم الطبيب أو التخصص', allSpecialties: 'كل التخصصات', map: 'الخريطة', list: 'القائمة', findingYou: 'جارٍ تحديد موقعك…', nearLocation: 'بالقرب منك', tunisLocation: 'تونس', nearby: 'بالقرب', sortedDistance: '· مرتبة حسب المسافة', tunisPilot: 'تجربة تونس', noDoctors: 'لم يتم العثور على أطباء', tryAnotherSearch: 'جرّب اسمًا أو تخصصًا آخر.', requestVisit: 'طلب موعد', chooseTime: 'اختر وقتًا', appointments: 'المواعيد', myAppointments: 'مواعيدي', yourCare: 'رعايتك', pendingConfirmation: 'يبقى الطلب قيد الانتظار حتى تؤكده العيادة.', noAppointments: 'لا توجد مواعيد بعد', appointmentsAppear: 'ستظهر طلباتك وتأكيدات المواعيد هنا.', findCare: 'ابحث عن رعاية',
    recoveryNotice: 'إذا تطابق الرقم مع حساب، فستُرسل تعليمات الاستعادة.', patientRole: 'مريض', dateDone: 'تم', dateCancel: 'إلغاء', appointmentRequestTitle: 'طلب موعد', appointmentSelectTime: 'اختر وقتًا متاحًا', appointmentDisclaimer: 'يُرسل هذا طلبًا إلى العيادة. لا يتأكد الموعد حتى ترد العيادة. لا يلزم إدخال الأعراض أو السجل الطبي.', appointmentSend: 'إرسال طلب الموعد', appointmentSent: 'تم إرسال طلبك. سيبقى معلقًا حتى تؤكده العيادة.',
  },
};
function tr(language, key) { return COPY[language]?.[key] || COPY.en[key] || key; }

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function initials(name = '') { return name.replace(/^Dr\.\s*/i, '').split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase(); }
function normalizePhone(value = '') {
  let digits = value.trim().replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('216') && digits.length === 11) return `+${digits}`;
  if (digits.length === 8) return `+216${digits}`;
  return `+${digits}`;
}
function phoneLocalDigits(value = '') {
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('216') && digits.length > 8) digits = digits.slice(3);
  return digits.slice(0, 8);
}
function getAge(value = '') {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
  const birth = new Date(year, month - 1, day); const today = new Date();
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > today) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age;
}
function getDateValue(value = '') {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return new Date(2000, 0, 1);
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? new Date(2000, 0, 1) : date;
}
function dateToDmy(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
function getPasswordStrength(password = '') {
  if (!password) return { level: 0, label: tr('en', 'passwordEmpty'), color: '#AAB7B3' };
  const mixed = Number(/[a-z]/.test(password)) + Number(/[A-Z]/.test(password)) + Number(/\d/.test(password));
  if (password.length >= 12 && mixed === 3 && /[^A-Za-z0-9]/.test(password)) return { level: 3, label: 'passwordPerfect', color: '#3F9277' };
  if (password.length >= 8 && mixed === 3) return { level: 2, label: 'passwordGood', color: '#C79145' };
  return { level: 1, label: 'passwordWeak', color: '#C36A63' };
}
function distanceKm(from, to) {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatDistance(km) { return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`; }
function isPsychiatrySpecialist(specialty = '') { return /psychiatr|psychiat|طب نفسي/i.test(specialty); }

const EVENT_COPY = {
  en: { eyebrow: 'MENTAL WELL-BEING', title: 'Support meetings', subtitle: 'Meet with a psychiatrist and others in a moderated, respectful space.', safety: 'Peer support can help people feel less alone, but it does not replace professional care. Keep shared topics general and avoid names, contact details, or personal medical information. If you may be in immediate danger, contact local emergency services.', empty: 'No meetings are scheduled yet', emptyHint: 'Psychiatrist-led meetings will appear here when published.', join: 'Join meeting', leave: 'Leave meeting', attendees: 'people interested', demo: 'DEMO EVENT', demoHost: 'Psychiatrist · demo host', doctorTitle: 'Peer-support meetings', doctorSub: 'Create a moderated group meeting around a mental well-being topic.', create: 'Publish meeting', topic: 'Meeting title', theme: 'Topic', date: 'Date', time: 'Time', format: 'Format', online: 'Online', inPerson: 'In person', place: 'Link or meeting place', description: 'What attendees can expect', own: 'Your published meetings', none: 'You have not published a meeting yet.', required: 'Add a title, topic, date, time, and meeting details.', psychiatristOnly: 'This section is available to psychiatrist accounts. Clinician identity must be verified by the service before public launch.' },
  fr: { eyebrow: 'BIEN-ÊTRE MENTAL', title: 'Rencontres de soutien', subtitle: 'Échangez avec un psychiatre et d’autres personnes dans un cadre modéré et respectueux.', safety: 'Le soutien entre pairs peut aider, mais ne remplace pas un suivi professionnel. Gardez les sujets généraux et évitez les noms, coordonnées ou informations médicales personnelles. En cas de danger immédiat, contactez les services d’urgence locaux.', empty: 'Aucune rencontre prévue', emptyHint: 'Les rencontres animées par un psychiatre apparaîtront ici après publication.', join: 'Participer', leave: 'Se désinscrire', attendees: 'personnes intéressées', demo: 'RENCONTRE DE DÉMO', demoHost: 'Psychiatre · organisateur démo', doctorTitle: 'Rencontres de soutien', doctorSub: 'Créez une rencontre modérée autour d’un sujet de bien-être mental.', create: 'Publier la rencontre', topic: 'Titre', theme: 'Sujet', date: 'Date', time: 'Heure', format: 'Format', online: 'En ligne', inPerson: 'En présentiel', place: 'Lien ou lieu', description: 'À quoi s’attendre', own: 'Vos rencontres publiées', none: 'Vous n’avez pas encore publié de rencontre.', required: 'Ajoutez un titre, un sujet, une date, une heure et les détails.', psychiatristOnly: 'Section réservée aux comptes de psychiatres. L’identité du professionnel devra être vérifiée avant le lancement public.' },
  ar: { eyebrow: 'الصحة النفسية', title: 'لقاءات دعم', subtitle: 'تبادلوا الحديث مع طبيب نفسي وأشخاص آخرين في مساحة آمنة بإشراف مختص.', safety: 'دعم الأقران لا يحل محل الرعاية المهنية. تجنبوا مشاركة الأسماء أو بيانات الاتصال أو المعلومات الطبية الشخصية. عند وجود خطر فوري، اتصلوا بخدمات الطوارئ المحلية.', empty: 'لا توجد لقاءات مجدولة بعد', emptyHint: 'ستظهر هنا اللقاءات التي ينظمها الأطباء النفسيون.', join: 'انضم إلى اللقاء', leave: 'إلغاء المشاركة', attendees: 'مهتمون', demo: 'لقاء تجريبي', demoHost: 'طبيب نفسي · منظم تجريبي', doctorTitle: 'لقاءات دعم جماعي', doctorSub: 'أنشئ لقاءً بإشراف مختص حول موضوع للصحة النفسية.', create: 'نشر اللقاء', topic: 'عنوان اللقاء', theme: 'الموضوع', date: 'التاريخ', time: 'الوقت', format: 'الصيغة', online: 'عن بُعد', inPerson: 'حضوري', place: 'الرابط أو المكان', description: 'ماذا يتوقع المشاركون', own: 'لقاءاتي المنشورة', none: 'لم تنشر لقاءً بعد.', required: 'أضف العنوان والموضوع والتاريخ والوقت والتفاصيل.', psychiatristOnly: 'هذا القسم مخصص لحسابات الأطباء النفسيين، ويجب التحقق من هوية الطبيب قبل الإطلاق.' },
};
function eventText(language, key) { return (EVENT_COPY[language] || EVENT_COPY.en)[key]; }

export default function App() {
  const [users, setUsers] = useState([]);
  const [accountsReady, setAccountsReady] = useState(false);
  const [accountStorageError, setAccountStorageError] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [supportEvents, setSupportEvents] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return [{
      id: 'demo-grief-support', doctorId: 'demo-psychiatrist', doctorName: '', demo: true,
      title: { en: 'Losing someone: sharing experiences of grief', fr: 'Perdre un proche : partager son expérience du deuil', ar: 'فقدان شخص عزيز: مشاركة تجارب الحزن' },
      theme: { en: 'Coping with the loss of someone close', fr: 'Faire face à la perte d’un proche', ar: 'التعامل مع فقدان شخص قريب' },
      date: dateToDmy(date), time: '17:00', format: 'In person', place: 'Tunis pilot · venue to be confirmed',
      description: {
        en: 'A psychiatrist-led, respectful conversation about grief. You may listen or share at your own pace. This peer-support meeting is not therapy.',
        fr: 'Un échange respectueux sur le deuil, animé par un psychiatre. Vous pouvez écouter ou partager à votre rythme. Cette rencontre de soutien ne remplace pas une thérapie.',
        ar: 'حوار يحترم الجميع حول الحزن بعد الفقد، بإشراف طبيب نفسي. يمكنك الاستماع أو المشاركة حسب راحتك. هذا اللقاء الداعم لا يُعد علاجًا نفسيًا.',
      }, attendees: [],
    }];
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [language, setLanguage] = useState('en');
  const [authMode, setAuthMode] = useState('login');
  const [accountType, setAccountType] = useState('adult');
  const [authError, setAuthError] = useState('');
  const [failedSignIns, setFailedSignIns] = useState(0);
  const [signInLockedUntil, setSignInLockedUntil] = useState(0);
  const [tab, setTab] = useState('discover');
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState('All specialties');
  const [mapRegion, setMapRegion] = useState(TUNIS);
  const [userLocation, setUserLocation] = useState({ latitude: TUNIS.latitude, longitude: TUNIS.longitude });
  const [locationLabel, setLocationLabel] = useState('Tunis, Tunisia');
  const [locating, setLocating] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(APPOINTMENT_SLOTS[0]);
  const [profileVisible, setProfileVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingQuestionId, setPendingQuestionId] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    let active = true;
    async function loadAccounts() {
      try {
        const idsJson = await SecureStore.getItemAsync(ACCOUNT_INDEX_KEY);
        const ids = idsJson ? JSON.parse(idsJson) : [];
        const records = await Promise.all(ids.map((id) => SecureStore.getItemAsync(`${ACCOUNT_KEY_PREFIX}${id}`)));
        const savedUsers = records.filter(Boolean).map((record) => JSON.parse(record));
        if (active) setUsers(savedUsers);
      } catch (error) {
        if (active) setAccountStorageError('Could not load saved accounts from this device. Close and reopen the app to try again.');
      } finally {
        if (active) setAccountsReady(true);
      }
    }
    loadAccounts();
    return () => { active = false; };
  }, []);

  async function persistAccounts(nextUsers) {
    // Store each record separately so a growing account list does not exceed
    // the secure store's per-value size limit.
    await Promise.all(nextUsers.map((user) => SecureStore.setItemAsync(
      `${ACCOUNT_KEY_PREFIX}${user.id}`,
      JSON.stringify(user),
    )));
    await SecureStore.setItemAsync(ACCOUNT_INDEX_KEY, JSON.stringify(nextUsers.map((user) => user.id)));
  }

  const providers = useMemo(() => [
    ...DEMO_DOCTORS,
    ...users.filter((user) => user.role === 'doctor').map((user) => ({
      id: user.id, name: user.name, specialty: user.specialty, clinic: user.clinic,
      address: user.address, latitude: user.latitude || TUNIS.latitude,
      longitude: user.longitude || TUNIS.longitude, doctorAccountId: user.id, slots: user.slots || APPOINTMENT_SLOTS,
    })),
  ], [users]);

  const nearbyDoctors = useMemo(() => providers
    .filter((doctor) => (specialty === 'All specialties' || doctor.specialty === specialty)
      && (!query.trim() || `${doctor.name} ${doctor.specialty} ${doctor.clinic} ${doctor.address}`.toLowerCase().includes(query.trim().toLowerCase())))
    .map((doctor) => ({ ...doctor, distance: distanceKm(userLocation, doctor) }))
    .sort((a, b) => a.distance - b.distance), [providers, specialty, query, userLocation]);

  const myAppointments = appointments.filter((appointment) => appointment.patientId === currentUser?.id);
  const clinicAppointments = appointments.filter((appointment) => appointment.doctorId === currentUser?.id);
  const secretaryAppointments = currentUser?.role === 'secretary'
    ? appointments.filter((appointment) => appointment.doctorId === currentUser.doctorId)
    : [];

  function showMessage(message) { Alert.alert('Careway', message); }
  function updateField(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function openSignup() { setAuthError(''); setAccountType('adult'); setAuthMode('signup'); }
  function logout() { setCurrentUser(null); setForm({}); setAuthError(''); setAuthMode('login'); setTab('discover'); }
  async function updateCurrentDoctor(changes) {
    const updated = { ...currentUser, ...changes };
    const nextUsers = users.map((user) => user.id === updated.id ? updated : user);
    try {
      await persistAccounts(nextUsers);
      setUsers(nextUsers);
      setCurrentUser(updated);
      return true;
    } catch (error) {
      showMessage('We could not save your profile on this device. Please try again.');
      return false;
    }
  }

  async function savePatientProfile(changes) {
    const updated = { ...currentUser, ...changes };
    const nextUsers = users.map((user) => user.id === updated.id ? updated : user);
    try {
      await persistAccounts(nextUsers);
      setUsers(nextUsers);
      setCurrentUser(updated);
      setProfileVisible(false);
      showMessage('Your profile was saved on this device.');
    } catch (error) {
      showMessage('We could not save your profile on this device. Please try again.');
    }
  }

  async function sendChatMessage(message, existingMessageId = null) {
    const clean = message.trim();
    if (!clean || chatLoading) return;
    const previousTurns = chatMessages.filter((turn) => turn.id !== existingMessageId).slice(-8).map((turn) => ({
      role: turn.from === 'patient' ? 'user' : 'assistant',
      content: turn.text.slice(0, 2000),
    }));
    const answers = pendingQuestionId ? [{ question_id: pendingQuestionId, answer: clean }] : [];
    if (!existingMessageId) setChatMessages((current) => [...current, { id: uid(), from: 'patient', text: clean }]);
    setChatLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 70000);
    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, conversation: previousTurns, answers }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`Chat service returned ${response.status}`);
      const replyParts = [data.message, data.follow_up_question?.text, data.disclaimer].filter(Boolean);
      setPendingQuestionId(data.follow_up_question?.question_id || null);
      setChatMessages((current) => [...current, {
        id: uid(), from: 'assistant', text: replyParts.join('\n\n'), level: data.level,
      }]);
    } catch (error) {
      const text = error?.name === 'AbortError'
        ? 'The care assistant took too long to respond. Please try again. If you think this is an emergency, contact local emergency services.'
        : `The care assistant could not be reached at ${CHAT_API_BASE_URL}. Make sure its service is running and this phone can reach the computer.`;
      setChatMessages((current) => [...current, { id: uid(), from: 'assistant', text, level: 'connection_error' }]);
    } finally {
      clearTimeout(timeoutId);
      setChatLoading(false);
    }
  }

  async function createAccount() {
    setAuthError('');
    const name = (form.name || '').trim();
    const dob = (form.dob || '').trim();
    const phone = normalizePhone(form.phone || '');
    const email = (form.email || '').trim().toLowerCase();
    const password = form.password || '';
    const dobAge = getAge(dob);
    const dependentName = (form.dependentName || '').trim();
    const dependentAge = getAge(form.dependentDob || '');
    if (!name || !dob || !phone || !password) return setAuthError(tr(language, 'errRequired'));
    if (dobAge === null) return setAuthError(tr(language, 'errDob'));
    if (!/^\+216\d{8}$/.test(phone)) return setAuthError(tr(language, 'errPhone'));
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setAuthError(tr(language, 'errEmail'));
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return setAuthError(tr(language, 'errPassword'));
    if (password !== form.confirmPassword) return setAuthError(tr(language, 'errMatch'));
    if (!form.termsAccepted) return setAuthError(tr(language, 'termsRequired'));
    if (accountType === 'adult' && dobAge < 18) return setAuthError(tr(language, 'errAdult'));
    if (accountType !== 'adult') {
      if (!dependentName || !form.dependentDob || dependentAge === null || !(form.relationship || '').trim()) return setAuthError(tr(language, 'errPatientDetails'));
      if (dobAge < 18) return setAuthError(tr(language, 'errGuardianAge'));
      if (accountType === 'minor' && dependentAge >= 18) return setAuthError(tr(language, 'errMinorAge'));
      if (!form.authorityConfirmed) return setAuthError(tr(language, accountType === 'minor' ? 'errGuardianAuthority' : 'errCareAuthority'));
    }
    if (users.some((user) => user.phone === phone || (email && user.email === email))) {
      return setAuthError(tr(language, 'errDuplicate'));
    }

    const patientName = accountType === 'adult' ? name : dependentName;
    const user = {
      id: uid(), role: 'patient', name: patientName, contactName: name,
      dob: accountType === 'adult' ? dob : form.dependentDob,
      accountHolderDob: dob, phone, email, password, accountType,
      relationship: accountType === 'minor' ? 'Parent or guardian' : accountType === 'caregiver' ? (form.relationship || 'Authorized caregiver') : 'Self',
      language, communicationsOptIn: Boolean(form.communicationsOptIn),
    };
    try {
      const nextUsers = [...users, user];
      await persistAccounts(nextUsers);
      setUsers(nextUsers);
    } catch (error) {
      return setAuthError('We could not save your account on this device. Please try again.');
    }
    setCurrentUser(user);
    setTab('discover');
    setForm({});
  }

  async function createDoctorAccount() {
    setAuthError('');
    const name = (form.doctorName || '').trim();
    const specialty = (form.doctorSpecialty || '').trim();
    const clinic = (form.doctorClinic || '').trim();
    const address = (form.doctorAddress || '').trim();
    const phone = normalizePhone(form.phone || '');
    const password = form.password || '';
    if (!name || !specialty || !clinic || !address || !phone || !password) return setAuthError('Complete all doctor profile and account fields.');
    if (!/^\+216\d{8}$/.test(phone)) return setAuthError('Enter exactly 8 digits for your Tunisian phone number.');
    if (users.some((user) => user.phone === phone)) return setAuthError('We could not create this account. Check the phone number or sign in.');
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return setAuthError('Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.');
    if (password !== form.confirmPassword) return setAuthError('The passwords do not match.');
    const doctor = { id: uid(), role: 'doctor', name, specialty, clinic, address, phone, password, latitude: TUNIS.latitude, longitude: TUNIS.longitude, slots: APPOINTMENT_SLOTS };
    try {
      const nextUsers = [...users, doctor];
      await persistAccounts(nextUsers);
      setUsers(nextUsers);
    } catch (error) {
      return setAuthError('We could not save your account on this device. Please try again.');
    }
    setCurrentUser(doctor);
    setTab('overview');
    setForm({});
  }

  async function createSecretary() {
    const name = (form.name || '').trim();
    const email = (form.email || '').trim().toLowerCase();
    const password = form.password || '';
    if (!name || !email || password.length < 6) return showMessage('Enter a name, email, and password with at least 6 characters.');
    if (users.some((user) => user.email === email)) return showMessage('An account with this email already exists in this demo session.');
    const secretary = { id: uid(), role: 'secretary', name, email, password, doctorId: currentUser.id, doctorName: currentUser.name };
    try {
      const nextUsers = [...users, secretary];
      await persistAccounts(nextUsers);
      setUsers(nextUsers);
    } catch (error) {
      return showMessage('We could not save the secretary account on this device. Please try again.');
    }
    setForm({});
    showMessage(`Secretary account created for ${name}. They can sign in using ${email} and the password you set.`);
  }

  function signIn() {
    setAuthError('');
    if (Date.now() < signInLockedUntil) return setAuthError('Too many attempts. Please wait a moment, then try again.');
    const phone = normalizePhone(form.phone || '');
    const password = form.password || '';
    if (!/^\+216\d{8}$/.test(phone) || !password) return setAuthError(tr(language, 'errLoginRequired'));
    const found = users.find((user) => user.phone === phone && user.password === password && ['patient', 'doctor'].includes(user.role));
    if (!found) {
      const nextCount = failedSignIns + 1;
      setFailedSignIns(nextCount);
      if (nextCount >= 5) { setSignInLockedUntil(Date.now() + 30000); setFailedSignIns(0); }
      return setAuthError(tr(language, nextCount >= 5 ? 'errRateLimit' : 'errSignIn'));
    }
    setFailedSignIns(0);
    setCurrentUser(found);
    setTab(found.role === 'doctor' ? 'overview' : 'discover');
    setForm({});
  }

  function recoverAccount() {
    setAuthError('');
    const phone = normalizePhone(form.phone || '');
    if (!/^\+216\d{8}$/.test(phone)) return setAuthError(tr(language, 'errRecoveryPhone'));
    setAuthError(tr(language, 'recoveryGeneric'));
  }

  async function findMyLocation() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        showMessage('Location permission was not granted. Search and the Tunis map still work without it.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setUserLocation(coords);
      setMapRegion({ ...coords, latitudeDelta: 0.08, longitudeDelta: 0.08 });
      setLocationLabel('Near your location');
    } catch {
      showMessage('Could not read your location. You can continue searching around Tunis.');
    } finally {
      setLocating(false);
    }
  }

  function requestAppointment(doctor) {
    setSelectedDoctor(doctor);
    setSelectedSlot((doctor.slots || APPOINTMENT_SLOTS)[0] || '');
  }

  function submitAppointment() {
    if (!selectedDoctor || !currentUser) return;
    const parts = selectedSlot.split(' · ');
    const request = {
      id: uid(), patientId: currentUser.id, patientName: currentUser.name,
      doctorId: selectedDoctor.doctorAccountId || selectedDoctor.id,
      doctorName: selectedDoctor.name, specialty: selectedDoctor.specialty,
      clinic: selectedDoctor.clinic, date: parts[0], time: parts[1], status: 'Pending',
    };
    setAppointments((current) => [request, ...current]);
    setSelectedDoctor(null);
    setTab('appointments');
    showMessage(tr(language, 'appointmentSent'));
  }

  function updateAppointment(id, status) {
    setAppointments((current) => current.map((appointment) => appointment.id === id ? { ...appointment, status } : appointment));
  }

  function createSupportEvent(details) {
    if (!currentUser || currentUser.role !== 'doctor') return;
    setSupportEvents((current) => [{ ...details, id: uid(), doctorId: currentUser.id, doctorName: currentUser.name, attendees: [] }, ...current]);
  }

  function toggleSupportEvent(eventId) {
    if (!currentUser || currentUser.role !== 'patient') return;
    setSupportEvents((current) => current.map((event) => {
      if (event.id !== eventId) return event;
      const joined = event.attendees.includes(currentUser.id);
      return { ...event, attendees: joined ? event.attendees.filter((id) => id !== currentUser.id) : [...event.attendees, currentUser.id] };
    }));
  }

  if (!accountsReady) {
    return <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={COLORS.teal} /><Text style={styles.screenSubtitle}>Loading saved accounts…</Text></SafeAreaView>;
  }
  if (accountStorageError) {
    return <SafeAreaView style={[styles.safe, { justifyContent: 'center', padding: 24 }]}><Text style={styles.screenTitle}>Accounts unavailable</Text><Text style={styles.screenSubtitle}>{accountStorageError}</Text></SafeAreaView>;
  }

  if (!currentUser) {
    if (authMode === 'signup') return <SignupScreen language={language} setLanguage={setLanguage} accountType={accountType} setAccountType={setAccountType} form={form} updateField={updateField} error={authError} onBack={() => { setAuthError(''); setAuthMode('login'); }} onSubmit={createAccount} onSignIn={() => { setAuthError(''); setAuthMode('login'); }} onRecovery={() => { setAuthError(''); setAuthMode('recovery'); }} />;
    if (authMode === 'doctorSignup') return <DoctorSignupScreen language={language} setLanguage={setLanguage} form={form} updateField={updateField} error={authError} onBack={() => { setAuthError(''); setForm({}); setAuthMode('login'); }} onSubmit={createDoctorAccount} />;
    if (authMode === 'recovery') return <RecoveryScreen language={language} setLanguage={setLanguage} form={form} updateField={updateField} error={authError} onBack={() => { setAuthError(''); setAuthMode('login'); }} onSubmit={recoverAccount} />;
    return <LoginScreen language={language} setLanguage={setLanguage} form={form} updateField={updateField} error={authError} onSubmit={signIn} onSignup={openSignup} onDoctorSignup={() => { setForm({}); setAuthError(''); setAuthMode('doctorSignup'); }} onRecovery={() => { setForm((current) => ({ phone: current.phone || '' })); setAuthError(''); setAuthMode('recovery'); }} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <View style={styles.app}>
        <Header user={currentUser} onLogout={logout} onProfile={() => setProfileVisible(true)} />
        {currentUser.role === 'patient' && tab === 'discover' && (
          <PatientDiscovery
            language={language} doctors={nearbyDoctors} query={query} setQuery={setQuery} specialty={specialty}
            setSpecialty={setSpecialty} onBook={requestAppointment}
          />
        )}
        {currentUser.role === 'patient' && tab === 'appointments' && (
          <PatientAppointments language={language} appointments={myAppointments} doctors={nearbyDoctors} region={mapRegion} setRegion={setMapRegion} locationLabel={locationLabel} locating={locating} onLocate={findMyLocation} onDiscover={() => setTab('discover')} />
        )}
        {currentUser.role === 'patient' && tab === 'assistant' && (
          <ChatAssistant messages={chatMessages} loading={chatLoading} onSend={sendChatMessage} onBack={() => setTab('discover')} />
        )}
        {currentUser.role === 'patient' && tab === 'events' && (
          <PatientSupportEvents language={language} events={supportEvents} user={currentUser} onToggleJoin={toggleSupportEvent} />
        )}
        {currentUser.role === 'doctor' && tab === 'overview' && (
          <DoctorOverview user={currentUser} appointments={clinicAppointments} onNavigate={setTab} />
        )}
        {currentUser.role === 'doctor' && tab === 'profile' && <DoctorProfile user={currentUser} form={form} updateField={updateField} onSave={updateCurrentDoctor} onSaved={showMessage} />}
        {currentUser.role === 'doctor' && tab === 'events' && isPsychiatrySpecialist(currentUser.specialty) && (
          <DoctorSupportEvents language={language} user={currentUser} events={supportEvents.filter((event) => event.doctorId === currentUser.id)} form={form} updateField={updateField} onCreate={createSupportEvent} />
        )}
        {currentUser.role === 'doctor' && tab === 'availability' && <AvailabilityScreen user={currentUser} form={form} updateField={updateField} onSave={updateCurrentDoctor} onMessage={showMessage} />}
        {currentUser.role === 'doctor' && tab === 'team' && (
          <TeamScreen user={currentUser} users={users} form={form} updateField={updateField} onCreate={createSecretary} />
        )}
        {currentUser.role === 'doctor' && tab === 'appointments' && (
          <ClinicAppointments appointments={clinicAppointments} onUpdate={updateAppointment} role="doctor" />
        )}
        {currentUser.role === 'secretary' && (tab === 'appointments' || tab === 'overview') && (
          <ClinicAppointments appointments={secretaryAppointments} onUpdate={updateAppointment} role="secretary" doctorName={currentUser.doctorName} />
        )}
        <BottomNav role={currentUser.role} user={currentUser} tab={tab} setTab={setTab} language={language} />
      </View>
      <Modal visible={Boolean(selectedDoctor)} animationType="slide" transparent onRequestClose={() => setSelectedDoctor(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}><Text style={styles.eyebrow}>{tr(language, 'appointmentRequestTitle')}</Text><TouchableOpacity onPress={() => setSelectedDoctor(null)}><Text style={styles.closeText}>×</Text></TouchableOpacity></View>
            {selectedDoctor && <View style={styles.modalDoctor}><Avatar name={selectedDoctor.name} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{selectedDoctor.name}</Text><Text style={styles.cardSubtitle}>{selectedDoctor.specialty} · {selectedDoctor.clinic}</Text></View></View>}
            <Text style={styles.label}>{tr(language, 'appointmentSelectTime')}</Text>
            <View style={styles.slotWrap}>{(selectedDoctor?.slots || APPOINTMENT_SLOTS).map((slot) => <TouchableOpacity key={slot} style={[styles.slotChip, selectedSlot === slot && styles.slotChipSelected]} onPress={() => setSelectedSlot(slot)}><Text style={[styles.slotText, selectedSlot === slot && styles.slotTextSelected]}>{slot}</Text></TouchableOpacity>)}</View>
            <Text style={styles.disclaimer}>{tr(language, 'appointmentDisclaimer')}</Text>
            <Button title={tr(language, 'appointmentSend')} onPress={submitAppointment} />
          </View>
        </View>
      </Modal>
      {currentUser.role === 'patient' && <PatientProfileModal visible={profileVisible} user={currentUser} onClose={() => setProfileVisible(false)} onSave={savePatientProfile} />}
    </SafeAreaView>
  );
}

function LoginScreen({ language, setLanguage, form, updateField, error, onSubmit, onSignup, onDoctorSignup, onRecovery }) {
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
    <AuthTop language={language} setLanguage={setLanguage} />
    <View style={styles.loginIntro}><Text style={styles.eyebrow}>{tr(language, 'careCloser')}</Text><Text style={styles.authTitle}>{tr(language, 'signIn')}</Text><Text style={styles.authSubtitle}>{tr(language, 'signInSubtitle')}</Text></View>
    <PhoneField language={language} value={form.phone || ''} onChange={(v) => updateField('phone', v)} />
    <Input label={tr(language, 'password')} placeholder={tr(language, 'passwordPlaceholder')} value={form.password || ''} onChangeText={(v) => updateField('password', v)} secureTextEntry autoComplete="password" textContentType="password" />
    <TouchableOpacity style={styles.forgotLink} onPress={onRecovery} accessibilityRole="button"><Text style={styles.linkText}>{tr(language, 'forgot')}</Text></TouchableOpacity>
    {error ? <AuthMessage message={error} /> : null}
    <Button title={tr(language, 'signIn')} onPress={onSubmit} style={{ marginTop: 12 }} />
    <View style={styles.authFooter}><Text style={styles.mutedText}>{tr(language, 'newToCareway')} </Text><TouchableOpacity onPress={onSignup} accessibilityRole="button"><Text style={styles.linkText}>{tr(language, 'createPatient')}</Text></TouchableOpacity></View>
    <View style={[styles.authFooter, { marginTop: 12 }]}><Text style={styles.mutedText}>Doctor? </Text><TouchableOpacity onPress={onDoctorSignup} accessibilityRole="button"><Text style={styles.linkText}>Create doctor account</Text></TouchableOpacity></View>
    <Text style={styles.demoCaption}>{tr(language, 'pilotPatient')}</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function DoctorSignupScreen({ language, setLanguage, form, updateField, error, onBack, onSubmit }) {
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
    <AuthTop language={language} setLanguage={setLanguage}/><TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button"><Text style={styles.backText}>‹  Back to patient sign in</Text></TouchableOpacity>
    <Text style={styles.authTitle}>Create doctor account</Text><Text style={styles.authSubtitle}>Create your doctor profile and sign in with your Tunisian phone number and password.</Text>
    <Input label="Doctor full name" placeholder="Your full name" value={form.doctorName || ''} onChangeText={(value) => updateField('doctorName', value)} autoCapitalize="words" autoComplete="name" />
    <Input label="Specialty" placeholder="e.g. Cardiology" value={form.doctorSpecialty || ''} onChangeText={(value) => updateField('doctorSpecialty', value)} autoCapitalize="words" />
    <Input label="Clinic name" placeholder="Clinic or practice name" value={form.doctorClinic || ''} onChangeText={(value) => updateField('doctorClinic', value)} />
    <Input label="Clinic address" placeholder="Street, district, city" value={form.doctorAddress || ''} onChangeText={(value) => updateField('doctorAddress', value)} />
    <PhoneField language={language} value={form.phone || ''} onChange={(value) => updateField('phone', value)} />
    <Input label="Create password" placeholder="At least 8 characters" value={form.password || ''} onChangeText={(value) => updateField('password', value)} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
    <PasswordStrength password={form.password || ''} language={language}/>
    <Input label="Confirm password" placeholder="Re-enter your password" value={form.confirmPassword || ''} onChangeText={(value) => updateField('confirmPassword', value)} secureTextEntry autoComplete="new-password" />
    {error ? <AuthMessage message={error}/> : null}
    <Button title="Create doctor account" onPress={onSubmit} style={{ marginTop: 12 }}/>
    <Text style={styles.helperText}>This doctor account is saved securely on this device. Doctor verification and publishing to all patients require a backend.</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function SignupScreen({ language, setLanguage, accountType, setAccountType, form, updateField, error, onBack, onSubmit, onSignIn, onRecovery }) {
  const forSomeoneElse = accountType !== 'adult';
  const email = (form.email || '').trim();
  const emailInvalid = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
    <AuthTop language={language} setLanguage={setLanguage} /><TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button"><Text style={styles.backText}>{tr(language, 'backSignIn')}</Text></TouchableOpacity>
    <Text style={styles.authTitle}>{tr(language, 'createAccount')}</Text><Text style={styles.authSubtitle}>{tr(language, 'signupSubtitle')}</Text>
    <Text style={styles.label}>{tr(language, 'accountFor')}</Text>
    <View style={styles.choiceRow} accessibilityRole="radiogroup">
      <ChoiceChip title={tr(language, 'myself')} selected={accountType === 'adult'} onPress={() => setAccountType('adult')} />
      <ChoiceChip title={tr(language, 'minor')} selected={accountType === 'minor'} onPress={() => setAccountType('minor')} />
      <ChoiceChip title={tr(language, 'caregiver')} selected={accountType === 'caregiver'} onPress={() => setAccountType('caregiver')} />
    </View>
    <Input label={forSomeoneElse ? tr(language, 'yourName') : tr(language, 'fullName')} placeholder={tr(language, 'fullName')} value={form.name || ''} onChangeText={(v) => updateField('name', v)} autoCapitalize="words" autoComplete="name" textContentType="name" />
    <DateField label={tr(language, 'yourDob')} placeholder={tr(language, 'datePlaceholder')} value={form.dob || ''} onChange={(v) => updateField('dob', v)} language={language} />
    {forSomeoneElse && <>
      <Input label={tr(language, 'patientName')} placeholder={tr(language, 'patientName')} value={form.dependentName || ''} onChangeText={(v) => updateField('dependentName', v)} autoCapitalize="words" />
      <DateField label={tr(language, 'patientDob')} placeholder={tr(language, 'datePlaceholder')} value={form.dependentDob || ''} onChange={(v) => updateField('dependentDob', v)} language={language} />
      <Input label={accountType === 'minor' ? tr(language, 'relationship') : tr(language, 'authority')} placeholder={accountType === 'minor' ? tr(language, 'guardian') : tr(language, 'caregiverPlaceholder')} value={form.relationship || ''} onChangeText={(v) => updateField('relationship', v)} />
      <CheckboxRow checked={Boolean(form.authorityConfirmed)} onPress={() => updateField('authorityConfirmed', !form.authorityConfirmed)} accessibilityLabel={accountType === 'minor' ? tr(language, 'errGuardianAuthority') : tr(language, 'errCareAuthority')} text={accountType === 'minor' ? tr(language, 'errGuardianAuthority') : tr(language, 'errCareAuthority')} />
    </>}
    <PhoneField language={language} value={form.phone || ''} onChange={(v) => updateField('phone', v)} />
    <Input label={tr(language, 'emailOptional')} placeholder={tr(language, 'emailPlaceholder')} value={form.email || ''} onChangeText={(v) => updateField('email', v)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
    {emailInvalid ? <Text style={styles.inlineError} accessibilityRole="alert">{tr(language, 'errEmail')}</Text> : null}
    <Input label={tr(language, 'passwordCreate')} placeholder="••••••••" value={form.password || ''} onChangeText={(v) => updateField('password', v)} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
    <PasswordStrength password={form.password || ''} language={language} />
    <Input label={tr(language, 'confirmPassword')} placeholder="••••••••" value={form.confirmPassword || ''} onChangeText={(v) => updateField('confirmPassword', v)} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
    <CheckboxRow checked={Boolean(form.termsAccepted)} onPress={() => updateField('termsAccepted', !form.termsAccepted)} accessibilityLabel={tr(language, 'terms')} text={<Text>{tr(language, 'terms')}<Text style={styles.requiredMark}> *</Text></Text>} />
    <CheckboxRow checked={Boolean(form.communicationsOptIn)} onPress={() => updateField('communicationsOptIn', !form.communicationsOptIn)} accessibilityLabel={tr(language, 'marketing')} text={tr(language, 'marketing')} />
    <Text style={styles.helperText}>{tr(language, 'signupHelper')}</Text>
    {error ? <AuthMessage message={error} onSignIn={onSignIn} onRecovery={onRecovery} /> : null}
    <Button title={tr(language, 'createButton')} onPress={onSubmit} style={{ marginTop: 16 }} />
    <View style={styles.authFooter}><Text style={styles.mutedText}>{tr(language, 'alreadyRegistered')} </Text><TouchableOpacity onPress={onSignIn} accessibilityRole="button"><Text style={styles.linkText}>{tr(language, 'signIn')}</Text></TouchableOpacity></View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function RecoveryScreen({ language, setLanguage, form, updateField, error, onBack, onSubmit }) {
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
    <AuthTop language={language} setLanguage={setLanguage} /><TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button"><Text style={styles.backText}>{tr(language, 'backSignIn')}</Text></TouchableOpacity>
    <Text style={styles.authTitle}>{tr(language, 'recoveryTitle')}</Text><Text style={styles.authSubtitle}>{tr(language, 'recoverySubtitle')}</Text>
    <PhoneField language={language} value={form.phone || ''} onChange={(v) => updateField('phone', v)} />
    {error ? <AuthMessage message={error} notice={error === tr(language, 'recoveryGeneric')} /> : null}
    <Button title={tr(language, 'continue')} onPress={onSubmit} style={{ marginTop: 14 }} />
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function Brand() { return <View style={styles.brand}><View style={styles.brandIcon}><Text style={styles.brandPlus}>+</Text></View><Text style={styles.brandName}>careway<Text style={{ color: COLORS.teal }}>.</Text></Text></View>; }
function Input({ label, accessibilityLabel, ...props }) { return <View style={styles.inputGroup}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#9AA7A4" accessibilityLabel={accessibilityLabel || label} {...props} /></View>; }
function AuthTop({ language, setLanguage }) { return <View style={styles.authTop}><Brand /><LanguageSelector language={language} onChange={setLanguage} /></View>; }
function LanguageSelector({ language, onChange }) { return <View style={styles.languageSelector} accessibilityRole="radiogroup" accessibilityLabel={tr(language, 'language')}>{[['en', 'EN'], ['fr', 'FR'], ['ar', 'ع']].map(([code, label]) => <TouchableOpacity key={code} onPress={() => onChange(code)} style={[styles.languageOption, language === code && styles.languageOptionActive]} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: language === code }}><Text style={[styles.languageOptionText, language === code && styles.languageOptionTextActive]}>{label}</Text></TouchableOpacity>)}</View>; }
function PhoneField({ language, value, onChange }) { const digits = phoneLocalDigits(value); return <View style={styles.inputGroup}><Text style={styles.label}>{tr(language, 'phone')}</Text><View style={styles.phoneField}><View style={styles.countryPrefix}><Text style={styles.countryPrefixText}>🇹🇳  +216</Text></View><TextInput style={styles.phoneInput} accessibilityLabel={tr(language, 'phone')} accessibilityHint={tr(language, 'phoneHint')} placeholder="20 123 456" placeholderTextColor="#9AA7A4" value={digits} onChangeText={(text) => onChange(phoneLocalDigits(text))} keyboardType="number-pad" maxLength={8} autoComplete="tel-national" textContentType="telephoneNumber" /></View><Text style={styles.fieldHint}>{tr(language, 'phoneHint')}</Text></View>; }
function DateField({ label, placeholder, value, onChange, language, allowFuture = false }) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(getDateValue(value));
  const selected = getDateValue(value);
  const close = () => setOpen(false);
  const change = (event, date) => {
    if (Platform.OS === 'android') {
      close();
      if (event.type === 'set' && date) onChange(dateToDmy(date));
    } else if (date) setDraftDate(date);
  };
  return <View style={styles.inputGroup}><Text style={styles.label}>{label}</Text><TouchableOpacity style={styles.dateInput} onPress={() => { setDraftDate(selected); setOpen(true); }} accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`}><Text style={[styles.dateInputText, !value && styles.placeholderText]}>{value || placeholder}</Text><Text style={styles.dateIcon}>▦</Text></TouchableOpacity>{open && Platform.OS === 'android' && <DateTimePicker value={selected} mode="date" display="default" maximumDate={allowFuture ? undefined : new Date()} minimumDate={allowFuture ? new Date() : undefined} onChange={change} />}{Platform.OS === 'ios' && <Modal visible={open} transparent animationType="slide" onRequestClose={close}><View style={styles.modalShade}><View style={styles.dateModalCard}><View style={styles.dateModalHeader}><TouchableOpacity onPress={close}><Text style={styles.linkText}>{tr(language, 'dateCancel')}</Text></TouchableOpacity><Text style={styles.dateModalTitle}>{label}</Text><TouchableOpacity onPress={() => { onChange(dateToDmy(draftDate)); close(); }}><Text style={styles.linkText}>{tr(language, 'dateDone')}</Text></TouchableOpacity></View><DateTimePicker value={draftDate} mode="date" display="spinner" maximumDate={allowFuture ? undefined : new Date()} minimumDate={allowFuture ? new Date() : undefined} onChange={change} locale={language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-TN' : 'en-US'} themeVariant="light" /></View></View></Modal>}</View>;
}
function PasswordStrength({ password, language }) {
  const strength = getPasswordStrength(password);
  const labelKey = strength.level === 0 ? 'passwordEmpty' : strength.level === 1 ? 'passwordWeak' : strength.level === 2 ? 'passwordGood' : 'passwordPerfect';
  const hintKey = strength.level === 0 ? 'passwordEmpty' : strength.level === 1 ? 'passwordWeakHint' : strength.level === 2 ? 'passwordGoodHint' : 'passwordPerfectHint';
  return <View style={styles.passwordStrength}><View style={styles.strengthHead}><Text style={styles.strengthCaption}>{tr(language, 'passwordEmpty')}</Text><Text style={[styles.strengthLabel, { color: strength.color }]}>{tr(language, labelKey)}</Text></View><View style={styles.strengthBars}>{[1, 2, 3].map((segment) => <View key={segment} style={[styles.strengthTrack, segment <= strength.level && { backgroundColor: strength.color }]} />)}</View><Text style={styles.fieldHint}>{tr(language, hintKey)}</Text><Text style={styles.fieldHint}>{tr(language, 'passwordSecurityNote')}</Text></View>;
}
function ChoiceChip({ title, selected, onPress }) { return <TouchableOpacity style={[styles.choiceChip, selected && styles.choiceChipSelected]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}><Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>{title}</Text></TouchableOpacity>; }
function CheckboxRow({ checked, onPress, text, accessibilityLabel }) { return <TouchableOpacity style={styles.checkboxRow} onPress={onPress} accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }}><View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Text style={styles.checkboxTick}>✓</Text>}</View><Text style={styles.checkboxText}>{text}</Text></TouchableOpacity>; }
function AuthMessage({ message, notice, onSignIn, onRecovery }) { return <View style={[styles.authMessage, notice && styles.authNotice]}><Text style={[styles.authMessageText, notice && styles.authNoticeText]} accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</Text>{onSignIn && onRecovery && <View style={styles.authMessageActions}><TouchableOpacity onPress={onSignIn} accessibilityRole="button"><Text style={styles.linkText}>Sign in</Text></TouchableOpacity><TouchableOpacity onPress={onRecovery} accessibilityRole="button"><Text style={styles.linkText}>Recover access</Text></TouchableOpacity></View>}</View>; }
function Button({ title, onPress, style }) { return <TouchableOpacity style={[styles.primaryButton, style]} onPress={onPress} activeOpacity={0.85}><Text style={styles.primaryButtonText}>{title}</Text><Text style={styles.buttonArrow}>›</Text></TouchableOpacity>; }
function Header({ user, onLogout, onProfile }) { return <View style={styles.header}><Brand /><View style={styles.headerActions}>{user.role === 'patient' && <TouchableOpacity style={styles.profileShortcut} onPress={onProfile} accessibilityRole="button" accessibilityLabel="Manage my profile"><Text style={styles.profileShortcutIcon}>{initials(user.contactName || user.name)}</Text><Text style={styles.profileShortcutLabel}>My profile</Text></TouchableOpacity>}<TouchableOpacity style={styles.headerUser} onPress={onLogout} accessibilityRole="button" accessibilityLabel="Sign out"><View style={styles.headerAvatar}><Text style={styles.avatarText}>{initials(user.name)}</Text></View><Text style={styles.headerMenu}>⌄</Text></TouchableOpacity></View></View>; }
function Avatar({ name }) { return <View style={styles.doctorAvatar}><Text style={styles.doctorAvatarText}>{initials(name)}</Text></View>; }

function PatientDiscovery({ doctors, query, setQuery, specialty, setSpecialty, onBook }) {
  return <View style={styles.screen}>
    <View style={styles.welcomeRow}><View><Text style={styles.eyebrow}>HEALTHCARE, MADE CLOSER</Text><Text style={styles.screenTitle}>Find a doctor</Text></View></View>
    <Text style={styles.screenSubtitle}>Search by name or specialty to find a doctor who meets your needs.</Text>
    <View style={styles.searchInputWrap}><Text style={styles.searchIcon}>⌕</Text><TextInput style={styles.searchInput} placeholder="Doctor name or specialty" placeholderTextColor="#9AA7A4" value={query} onChangeText={setQuery} returnKeyType="search" /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specialtyRow}>{SPECIALTIES.map((item) => <TouchableOpacity key={item} onPress={() => setSpecialty(item)} style={[styles.specialtyChip, specialty === item && styles.specialtyChipActive]}><Text style={[styles.specialtyText, specialty === item && styles.specialtyTextActive]}>{item}</Text></TouchableOpacity>)}</ScrollView>
    <View style={styles.resultsHeader}><Text style={styles.resultsTitle}>{doctors.length} doctors</Text><Text style={styles.demoLabel}>TUNIS PILOT</Text></View>
    <ScrollView style={styles.doctorResults} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
      {doctors.length ? doctors.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} onBook={() => onBook(doctor)} />) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No doctors found</Text><Text style={styles.emptyCopy}>Try a different name or specialty.</Text></View>}
    </ScrollView>
  </View>;
}

function DoctorCard({ doctor, onBook }) { return <View style={styles.doctorCard}><View style={styles.doctorCardTop}><Avatar name={doctor.name} /><View style={{ flex: 1 }}><View style={styles.nameLine}><Text style={styles.cardTitle} numberOfLines={1}>{doctor.name}</Text><Text style={styles.verified}>{doctor.demo ? 'DEMO' : 'NEW'}</Text></View><Text style={styles.cardSubtitle}>{doctor.specialty}</Text><Text style={styles.addressText} numberOfLines={2}>{doctor.clinic} · {doctor.address}</Text></View><Text style={styles.distanceText}>{formatDistance(doctor.distance)}</Text></View><View style={styles.cardFooter}><Text style={styles.nextAvailable}><Text style={styles.greenDot}>● </Text>Request a visit</Text><TouchableOpacity style={styles.bookButton} onPress={onBook}><Text style={styles.bookButtonText}>Choose time</Text></TouchableOpacity></View></View>; }

function PatientAppointments({ appointments, doctors, region, setRegion, locationLabel, locating, onLocate, onDiscover }) {
  return <View style={styles.screen}><Text style={styles.eyebrow}>YOUR CARE</Text><Text style={styles.screenTitle}>Appointments</Text><Text style={styles.screenSubtitle}>Review your requests and find nearby clinics on the map.</Text><ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 18 }}>
    <View style={styles.patientMapHead}><Text style={styles.label}>Nearby doctors</Text><TouchableOpacity style={styles.locationChip} onPress={onLocate} disabled={locating}><Text style={styles.locationPin}>⌖</Text><Text style={styles.locationText}>{locating ? 'Finding you…' : locationLabel}</Text></TouchableOpacity></View>
    <View style={styles.mapFrame}><MapView style={styles.map} region={region} onRegionChangeComplete={setRegion} showsUserLocation={locationLabel === 'Near your location'}>{doctors.map((doctor) => <Marker key={doctor.id} coordinate={{ latitude: doctor.latitude, longitude: doctor.longitude }} title={doctor.name} description={`${doctor.specialty} · ${doctor.clinic}`} pinColor={COLORS.teal} />)}</MapView><View style={styles.mapCount}><Text style={styles.mapCountText}>{doctors.length} nearby</Text></View></View>
    <Text style={[styles.label, { marginTop: 16 }]}>My appointment requests</Text>
    {appointments.length ? appointments.map((item) => <AppointmentCard key={item.id} appointment={item} patient />) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No appointments yet</Text><Text style={styles.emptyCopy}>Your appointment requests and confirmations will appear here.</Text><Button title="Find a doctor" onPress={onDiscover} style={{ marginTop: 18 }} /></View>}
  </ScrollView></View>;
}

function PatientSupportEvents({ language, events, user, onToggleJoin }) {
  const t = (key) => eventText(language, key);
  const localized = (value) => typeof value === 'string' ? value : (value?.[language] || value?.en || '');
  return <View style={styles.screen}><Text style={styles.eyebrow}>{t('eyebrow')}</Text><Text style={styles.screenTitle}>{t('title')}</Text><Text style={styles.screenSubtitle}>{t('subtitle')}</Text><View style={styles.permissionBox}>{t('safety')}</View><ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>{events.length ? events.map((event) => {
    const joined = event.attendees.includes(user.id);
    return <View key={event.id} style={styles.appointmentCard}>{event.demo && <Text style={styles.demoLabel}>{t('demo')}</Text>}<Text style={styles.cardTitle}>{localized(event.title)}</Text><Text style={styles.cardSubtitle}>{localized(event.theme)}</Text><View style={styles.appointmentMeta}><Text style={styles.dateText}>▦  {event.date} · {event.time}</Text><Text style={styles.cardSubtitle}>{event.format === 'Online' ? t('online') : t('inPerson')} · {event.place}</Text><Text style={styles.cardSubtitle}>{event.demo ? t('demoHost') : `Dr. ${event.doctorName}`}</Text><Text style={styles.cardSubtitle}>{event.attendees.length} {t('attendees')}</Text>{event.description ? <Text style={styles.disclaimer}>{localized(event.description)}</Text> : null}</View><TouchableOpacity style={[styles.bookButton, joined && { backgroundColor: COLORS.body }]} onPress={() => onToggleJoin(event.id)} accessibilityRole="button"><Text style={styles.bookButtonText}>{joined ? t('leave') : t('join')}</Text></TouchableOpacity></View>;
  }) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{t('empty')}</Text><Text style={styles.emptyCopy}>{t('emptyHint')}</Text></View>}</ScrollView></View>;
}

function DoctorSupportEvents({ language, user, events, form, updateField, onCreate }) {
  const t = (key) => eventText(language, key);
  const publish = () => {
    const title = (form.eventTitle || '').trim(); const theme = (form.eventTheme || '').trim();
    const date = (form.eventDate || '').trim(); const time = (form.eventTime || '').trim(); const place = (form.eventPlace || '').trim();
    if (!title || !theme || !date || !time || !place) { Alert.alert(t('doctorTitle'), t('required')); return; }
    onCreate({ title, theme, date, time, format: form.eventFormat || 'Online', place, description: (form.eventDescription || '').trim() });
    ['eventTitle', 'eventTheme', 'eventDate', 'eventTime', 'eventPlace', 'eventDescription'].forEach((key) => updateField(key, ''));
  };
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Text style={styles.eyebrow}>{t('eyebrow')}</Text><Text style={styles.screenTitle}>{t('doctorTitle')}</Text><Text style={styles.screenSubtitle}>{t('doctorSub')}</Text><View style={styles.permissionBox}>{t('psychiatristOnly')}</View><ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled"><View style={styles.formCard}><Input label={t('topic')} value={form.eventTitle || ''} onChangeText={(value) => updateField('eventTitle', value)} /><Input label={t('theme')} value={form.eventTheme || ''} onChangeText={(value) => updateField('eventTheme', value)} /><DateField label={t('date')} placeholder={t('date')} value={form.eventDate || ''} onChange={(value) => updateField('eventDate', value)} language={language} allowFuture /><Input label={t('time')} placeholder="18:00" value={form.eventTime || ''} onChangeText={(value) => updateField('eventTime', value)} /><Text style={styles.label}>{t('format')}</Text><View style={styles.choiceRow}><ChoiceChip title={t('online')} selected={(form.eventFormat || 'Online') === 'Online'} onPress={() => updateField('eventFormat', 'Online')} /><ChoiceChip title={t('inPerson')} selected={form.eventFormat === 'In person'} onPress={() => updateField('eventFormat', 'In person')} /></View><Input label={t('place')} value={form.eventPlace || ''} onChangeText={(value) => updateField('eventPlace', value)} /><Input label={t('description')} value={form.eventDescription || ''} onChangeText={(value) => updateField('eventDescription', value)} multiline style={{ height: 86, textAlignVertical: 'top', paddingTop: 11 }} /><Button title={t('create')} onPress={publish} /></View><SectionTitle title={t('own')} />{events.length ? events.map((event) => <View key={event.id} style={styles.appointmentCard}><Text style={styles.cardTitle}>{event.title}</Text><Text style={styles.cardSubtitle}>{event.theme}</Text><Text style={styles.dateText}>{event.date} · {event.time} · {event.format}</Text></View>) : <View style={styles.emptyCard}><Text style={styles.emptyCopy}>{t('none')}</Text></View>}</ScrollView></KeyboardAvoidingView>;
}

function ChatAssistant({ messages, loading, onSend, onBack }) {
  const [draft, setDraft] = useState('');
  const messageList = useRef(null);
  function submit() { if (!draft.trim() || loading) return; onSend(draft); setDraft(''); }
  return <KeyboardAvoidingView style={styles.chatScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.chatHeader}><TouchableOpacity onPress={onBack} style={styles.chatBack} accessibilityRole="button" accessibilityLabel="Back to doctor search"><Text style={styles.chatBackGlyph}>‹</Text></TouchableOpacity><Text style={styles.chatHeaderTitle}>Care assistant</Text><View style={styles.chatHeaderBalance}/></View>
    <ScrollView ref={messageList} style={styles.chatMessages} contentContainerStyle={styles.chatMessagesContent} onContentSizeChange={() => messageList.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
      <View style={styles.chatNotice}><Text style={styles.chatNoticeTitle}>Health information</Text><Text style={styles.chatNoticeText}>This service does not diagnose or replace a healthcare professional. Replies are currently in French. If you think this is an emergency, contact local emergency services.</Text></View>
      <View style={styles.assistantBubble}><Text style={styles.chatBubbleText}>Hi, I’m here to listen. What would you like to talk about?</Text></View>
      {messages.map((message) => <View key={message.id} style={[message.from === 'patient' ? styles.patientBubble : styles.assistantBubble, message.level === 'emergency' && styles.emergencyBubble]}>{message.level && message.from === 'assistant' && <Text style={[styles.chatLevel, message.level === 'emergency' && styles.emergencyLevel]}>{message.level.replace(/_/g, ' ')}</Text>}<Text style={styles.chatBubbleText}>{message.text}</Text></View>)}
      {loading && <View style={styles.chatLoading}><ActivityIndicator color={COLORS.teal}/><Text style={styles.chatLoadingText}>Getting a response…</Text></View>}
    </ScrollView>
    <View style={styles.chatComposer}><TextInput style={styles.chatInput} value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor="#9AA7A4" multiline accessibilityLabel="Write a message" editable={!loading} /><TouchableOpacity style={[styles.chatSend, loading && styles.chatSendDisabled]} onPress={submit} disabled={loading} accessibilityRole="button" accessibilityLabel="Send message"><Text style={styles.chatSendText}>➤</Text></TouchableOpacity></View>
  </KeyboardAvoidingView>;
}

function PatientProfileModal({ visible, user, onClose, onSave }) {
  const [name, setName] = useState(user.contactName || user.name || '');
  const [email, setEmail] = useState(user.email || '');
  React.useEffect(() => { if (visible) { setName(user.contactName || user.name || ''); setEmail(user.email || ''); } }, [visible, user]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.profileModalCard}><View style={styles.modalHead}><Text style={styles.screenTitle}>My profile</Text><TouchableOpacity onPress={onClose}><Text style={styles.closeText}>×</Text></TouchableOpacity></View><Text style={styles.screenSubtitle}>Manage your account details.</Text><Input label="Full name" value={name} onChangeText={setName} autoCapitalize="words" /><Input label="Phone number" value={user.phone || ''} editable={false} /><Input label="Email address (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /><Text style={styles.helperText}>Profile changes are saved securely on this device.</Text><Button title="Save profile" onPress={() => onSave({ contactName: name.trim(), name: user.accountType === 'adult' ? name.trim() : user.name, email: email.trim().toLowerCase() })} style={{ marginTop: 14 }} /></View></View></Modal>;
}

function DoctorOverview({ user, appointments, onNavigate }) {
  const pending = appointments.filter((item) => item.status === 'Pending').length;
  return <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}><Text style={styles.eyebrow}>CLINIC WORKSPACE</Text><Text style={styles.screenTitle}>Welcome, {user.name.split(' ')[0]}</Text><Text style={styles.screenSubtitle}>Manage your profile, clinic team, availability, and appointment requests.</Text><View style={styles.statsRow}><Stat label="Pending requests" value={pending} /><Stat label="Total appointments" value={appointments.length} /></View><View style={styles.quickActions}><QuickAction icon="▤" title="Appointments" onPress={() => onNavigate('appointments')} /><QuickAction icon="＋" title="Add secretary" onPress={() => onNavigate('team')} /><QuickAction icon="◷" title="Availability" onPress={() => onNavigate('availability')} /><QuickAction icon="◎" title="Edit profile" onPress={() => onNavigate('profile')} /></View><SectionTitle title="Recent requests" action="View all" onAction={() => onNavigate('appointments')} />{appointments.slice(0, 3).length ? appointments.slice(0, 3).map((item) => <AppointmentCard key={item.id} appointment={item} />) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No appointment requests</Text><Text style={styles.emptyCopy}>Patient requests will appear here.</Text></View>}</ScrollView>;
}

function DoctorProfile({ user, form, updateField, onSave, onSaved }) { return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled"><Text style={styles.eyebrow}>PUBLIC PROFILE</Text><Text style={styles.screenTitle}>My profile</Text><Text style={styles.screenSubtitle}>Keep the information patients see in your listing up to date.</Text><View style={styles.formCard}><Input label="Doctor name" placeholder={user.name} value={form.profileName ?? user.name} onChangeText={(v) => updateField('profileName', v)} /><Input label="Specialty" placeholder={user.specialty} value={form.profileSpecialty ?? user.specialty} onChangeText={(v) => updateField('profileSpecialty', v)} /><Input label="Clinic name" placeholder={user.clinic} value={form.profileClinic ?? user.clinic} onChangeText={(v) => updateField('profileClinic', v)} /><Input label="Clinic address" placeholder={user.address} value={form.profileAddress ?? user.address} onChangeText={(v) => updateField('profileAddress', v)} /><Button title="Save profile" onPress={async () => { const saved = await onSave({ name: (form.profileName || user.name).trim(), specialty: (form.profileSpecialty || user.specialty).trim(), clinic: (form.profileClinic || user.clinic).trim(), address: (form.profileAddress || user.address).trim() }); if (saved) onSaved('Your profile has been saved on this device.'); }} /></View><Text style={styles.helperText}>Your profile is saved on this device. Doctor verification and publishing controls require the project backend.</Text></ScrollView></KeyboardAvoidingView>; }

function AvailabilityScreen({ user, form, updateField, onSave, onMessage }) {
  const slots = user.slots || APPOINTMENT_SLOTS;
  return <View style={styles.screen}><Text style={styles.eyebrow}>CLINIC WORKSPACE</Text><Text style={styles.screenTitle}>Availability</Text><Text style={styles.screenSubtitle}>Patients can request the time slots you publish here.</Text><View style={styles.formCard}><Input label="Add a time slot" placeholder="e.g. Monday · 09:30" value={form.newSlot || ''} onChangeText={(value) => updateField('newSlot', value)} /><Button title="Add availability" onPress={() => { const value = (form.newSlot || '').trim(); if (!value) return onMessage('Enter a day and time.'); onSave({ slots: [...slots, value] }); updateField('newSlot', ''); }} /></View><SectionTitle title="Open time slots" />{slots.map((slot, index) => <View key={`${slot}-${index}`} style={styles.slotRow}><Text style={styles.slotText}>{slot}</Text><TouchableOpacity onPress={() => onSave({ slots: slots.filter((_, itemIndex) => itemIndex !== index) })}><Text style={styles.removeSlot}>×</Text></TouchableOpacity></View>)}{slots.length === 0 && <View style={styles.emptyCard}><Text style={styles.emptyCopy}>No open slots. Add a time above.</Text></View>}<Text style={styles.helperText}>A clinic backend will be needed to synchronize bookings and avoid double booking across devices.</Text></View>;
}

function TeamScreen({ user, users, form, updateField, onCreate }) {
  const team = users.filter((item) => item.role === 'secretary' && item.doctorId === user.id);
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={{ paddingBottom: 25 }} keyboardShouldPersistTaps="handled"><Text style={styles.eyebrow}>CLINIC TEAM</Text><Text style={styles.screenTitle}>Add a secretary</Text><Text style={styles.screenSubtitle}>Create an account for a secretary assigned to your clinic.</Text><View style={styles.formCard}><Input label="Secretary full name" placeholder="Full name" value={form.name || ''} onChangeText={(v) => updateField('name', v)} autoCapitalize="words" /><Input label="Email address" placeholder="secretary@example.com" value={form.email || ''} onChangeText={(v) => updateField('email', v)} keyboardType="email-address" autoCapitalize="none" /><Input label="Temporary password" placeholder="At least 6 characters" value={form.password || ''} onChangeText={(v) => updateField('password', v)} secureTextEntry /><Text style={styles.permissionBox}><Text style={styles.permissionStrong}>Limited access. </Text>Secretaries can manage appointment requests assigned to your clinic. They cannot create doctor profiles or change your account.</Text><Button title="Create secretary account" onPress={onCreate} /></View><SectionTitle title="Your secretaries" /><View>{team.length ? team.map((member) => <View key={member.id} style={styles.teamMember}><Avatar name={member.name} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{member.name}</Text><Text style={styles.cardSubtitle}>{member.email}</Text></View><Text style={styles.teamBadge}>SECRETARY</Text></View>) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No secretary accounts yet</Text><Text style={styles.emptyCopy}>Accounts you create will be listed here.</Text></View>}</View></ScrollView></KeyboardAvoidingView>;
}

function ClinicAppointments({ appointments, onUpdate, role, doctorName }) {
  return <View style={styles.screen}><Text style={styles.eyebrow}>{role === 'doctor' ? 'DOCTOR WORKSPACE' : 'ASSIGNED CLINIC'}</Text><Text style={styles.screenTitle}>Appointments</Text><Text style={styles.screenSubtitle}>{role === 'secretary' ? `Managing requests for ${doctorName}.` : 'Review requests and update their status.'}</Text><View style={styles.permissionBox}><Text style={styles.permissionStrong}>{role === 'secretary' ? 'Secretary permissions. ' : 'Appointment management. '}</Text>{role === 'secretary' ? 'You can confirm or decline requests for your assigned doctor. Profile and account settings are restricted.' : 'Confirming or declining a request updates its status for the patient.'}</View><ScrollView style={{ flex: 1, marginTop: 10 }} contentContainerStyle={{ paddingBottom: 25 }}>{appointments.length ? appointments.map((item) => <AppointmentCard key={item.id} appointment={item} onUpdate={onUpdate} />) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No requests to review</Text><Text style={styles.emptyCopy}>New patient requests will show up here.</Text></View>}</ScrollView></View>;
}

function AppointmentCard({ appointment, onUpdate, patient = false }) {
  const color = appointment.status === 'Confirmed' ? COLORS.green : appointment.status === 'Declined' ? COLORS.red : COLORS.amber;
  return <View style={styles.appointmentCard}><View style={styles.appointmentTop}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{patient ? appointment.doctorName : appointment.patientName}</Text><Text style={styles.cardSubtitle}>{patient ? appointment.specialty : appointment.clinic}</Text></View><View style={[styles.statusPill, { backgroundColor: `${color}18` }]}><Text style={[styles.statusText, { color }]}>{appointment.status}</Text></View></View><View style={styles.appointmentMeta}><Text style={styles.dateText}>▦  {appointment.date} · {appointment.time}</Text></View>{!patient && appointment.status === 'Pending' && <View style={styles.actionRow}><TouchableOpacity style={styles.acceptButton} onPress={() => onUpdate(appointment.id, 'Confirmed')}><Text style={styles.acceptText}>Confirm</Text></TouchableOpacity><TouchableOpacity style={styles.declineButton} onPress={() => onUpdate(appointment.id, 'Declined')}><Text style={styles.declineText}>Decline</Text></TouchableOpacity></View>}</View>;
}

function BottomNav({ role, user, tab, setTab }) {
  const items = role === 'patient' ? [['discover', '⌕', 'Find care'], ['appointments', '▦', 'Appointments'], ['assistant', '✦', 'Assistant'], ['events', '◷', 'Events']]
    : role === 'doctor' ? [['overview', '⌂', 'Overview'], ['appointments', '▦', 'Visits'], ['availability', '◷', 'Slots'], ['team', '♧', 'Team'], ...(isPsychiatrySpecialist(user?.specialty) ? [['events', '♡', 'Events']] : []), ['profile', '◎', 'Profile']]
      : [['overview', '⌂', 'Clinic'], ['appointments', '▦', 'Appointments']];
  return <View style={styles.bottomNav}>{items.map(([key, icon, label]) => <TouchableOpacity key={key} style={styles.navItem} onPress={() => setTab(key)}><Text style={[styles.navIcon, tab === key && styles.navIconActive]}>{icon}</Text><Text style={[styles.navLabel, tab === key && styles.navLabelActive]}>{label}</Text></TouchableOpacity>)}</View>;
}

function Stat({ label, value }) { return <View style={styles.statCard}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function QuickAction({ icon, title, onPress }) { return <TouchableOpacity style={styles.quickAction} onPress={onPress}><Text style={styles.quickIcon}>{icon}</Text><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickArrow}>›</Text></TouchableOpacity>; }
function SectionTitle({ title, action, onAction }) { return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action && <TouchableOpacity onPress={onAction}><Text style={styles.linkText}>{action} ›</Text></TouchableOpacity>}</View>; }
function InfoRow({ label, value }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas }, app: { flex: 1, backgroundColor: COLORS.canvas },
  authScroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 30 },
  authTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 38 },
  languageSelector: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E9EFED', borderRadius: 8, padding: 3 },
  languageOption: { minWidth: 31, minHeight: 28, paddingHorizontal: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  languageOptionActive: { backgroundColor: 'white' },
  languageOptionText: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  languageOptionTextActive: { color: COLORS.tealDark },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center' }, brandPlus: { color: 'white', fontSize: 26, fontWeight: '400', lineHeight: 29 }, brandName: { color: COLORS.deep, fontSize: 21, fontWeight: '800', letterSpacing: -1 },
  welcomeHero: { marginTop: 28, backgroundColor: '#EAF4F1', borderRadius: 24, padding: 23, overflow: 'hidden' }, heroOrb: { position: 'absolute', right: -28, top: 8, width: 140, height: 140, borderRadius: 100, backgroundColor: '#DDEDE8', alignItems: 'center', justifyContent: 'center' }, heroPlus: { color: '#8AB6AA', fontSize: 96, fontWeight: '200', marginTop: -6 }, heroEyebrow: { color: COLORS.teal, fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginTop: 15 }, heroTitle: { color: COLORS.deep, fontWeight: '800', fontSize: 33, lineHeight: 38, letterSpacing: -1, marginTop: 12 }, heroText: { maxWidth: 245, color: '#718782', fontSize: 13, lineHeight: 20, marginTop: 12, marginBottom: 12 },
  sectionTitle: { color: COLORS.deep, fontWeight: '700', fontSize: 14, marginTop: 22, marginBottom: 10 }, authRoleCard: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 9 }, authRoleIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.mint, alignItems: 'center', justifyContent: 'center' }, authRoleTitle: { color: COLORS.deep, fontSize: 13, fontWeight: '700' }, authRoleDetail: { color: COLORS.muted, fontSize: 10, marginTop: 4, lineHeight: 15 }, chevron: { color: COLORS.teal, fontSize: 24, marginHorizontal: 4 }, authFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 22 }, mutedText: { color: COLORS.muted, fontSize: 11 }, linkText: { color: COLORS.teal, fontWeight: '700', fontSize: 11 }, demoCaption: { textAlign: 'center', color: '#A0ACA8', fontSize: 9, marginTop: 25 },
  backButton: { paddingVertical: 12, alignSelf: 'flex-start' }, backText: { color: COLORS.teal, fontSize: 13, fontWeight: '700' }, authTitle: { color: COLORS.deep, fontSize: 25, fontWeight: '800', letterSpacing: -0.6, marginTop: 25 }, authSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 7, marginBottom: 21, lineHeight: 18 }, loginIntro: { marginTop: 41, marginBottom: 18 }, forgotLink: { alignSelf: 'flex-end', marginTop: -2, marginBottom: 8, minHeight: 34, justifyContent: 'center' }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 }, choiceChip: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: 'white', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, minHeight: 34, justifyContent: 'center' }, choiceChipSelected: { backgroundColor: COLORS.mint, borderColor: '#BBD8CF' }, choiceChipText: { color: COLORS.body, fontSize: 9, fontWeight: '600' }, choiceChipTextSelected: { color: COLORS.tealDark, fontWeight: '800' }, checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 8, minHeight: 42 }, checkbox: { width: 19, height: 19, borderWidth: 1, borderColor: '#AAB9B5', borderRadius: 5, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginTop: 1 }, checkboxChecked: { backgroundColor: COLORS.teal, borderColor: COLORS.teal }, checkboxTick: { color: 'white', fontSize: 12, fontWeight: '800' }, checkboxText: { flex: 1, color: COLORS.body, fontSize: 10, lineHeight: 16 }, inlineLink: { color: COLORS.teal, fontWeight: '700', textDecorationLine: 'underline' }, requiredMark: { color: COLORS.red, fontWeight: '800' }, authMessage: { backgroundColor: '#F9EEEE', borderWidth: 1, borderColor: '#EED8D7', padding: 11, borderRadius: 8, marginTop: 10 }, authNotice: { backgroundColor: '#EFF7F4', borderColor: '#D8EAE4' }, authMessageText: { color: '#9B514D', fontSize: 10, lineHeight: 15 }, authNoticeText: { color: COLORS.tealDark }, authMessageActions: { flexDirection: 'row', gap: 18, marginTop: 8 },
  inputGroup: { marginBottom: 13 }, label: { color: '#617571', fontSize: 10, fontWeight: '700', marginBottom: 6 }, input: { height: 45, borderColor: COLORS.line, borderWidth: 1, borderRadius: 9, backgroundColor: 'white', paddingHorizontal: 12, color: COLORS.ink, fontSize: 12 }, helperText: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 7 }, primaryButton: { minHeight: 47, borderRadius: 9, backgroundColor: COLORS.teal, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, primaryButtonText: { color: 'white', fontWeight: '700', fontSize: 12 }, buttonArrow: { color: 'white', fontSize: 21, position: 'absolute', right: 14 }, secretaryHint: { marginTop: 24, backgroundColor: COLORS.mint, padding: 13, borderRadius: 10 }, hintTitle: { color: COLORS.tealDark, fontWeight: '700', fontSize: 11 },
  phoneField: { minHeight: 45, borderColor: COLORS.line, borderWidth: 1, borderRadius: 9, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }, countryPrefix: { height: 45, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: COLORS.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAF9' }, countryPrefixText: { color: COLORS.body, fontSize: 11, fontWeight: '700' }, phoneInput: { flex: 1, height: 45, paddingHorizontal: 11, color: COLORS.ink, fontSize: 12 }, fieldHint: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 6 }, inlineError: { color: COLORS.red, fontSize: 10, marginTop: -8, marginBottom: 12 }, placeholderText: { color: '#9AA7A4' }, dateInput: { height: 45, borderColor: COLORS.line, borderWidth: 1, borderRadius: 9, backgroundColor: 'white', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dateInputText: { color: COLORS.ink, fontSize: 12 }, dateIcon: { color: COLORS.teal, fontSize: 16 }, dateModalCard: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 17, paddingBottom: 27 }, dateModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 35 }, dateModalTitle: { color: COLORS.deep, fontSize: 12, fontWeight: '700', flexShrink: 1, marginHorizontal: 10 }, passwordStrength: { marginTop: -4, marginBottom: 13 }, strengthHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, strengthCaption: { color: COLORS.muted, fontSize: 10 }, strengthLabel: { fontSize: 10, fontWeight: '800' }, strengthBars: { flexDirection: 'row', gap: 5, marginTop: 7 }, strengthTrack: { height: 4, flex: 1, borderRadius: 3, backgroundColor: '#E7ECEA' },
  header: { minHeight: 61, paddingHorizontal: 18, borderBottomColor: COLORS.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.canvas }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 }, profileShortcut: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, paddingVertical: 5, paddingHorizontal: 8 }, profileShortcutIcon: { width: 24, height: 24, borderRadius: 12, color: COLORS.tealDark, backgroundColor: COLORS.mint, textAlign: 'center', textAlignVertical: 'center', fontSize: 8, fontWeight: '800', overflow: 'hidden', paddingTop: 6 }, profileShortcutLabel: { color: COLORS.tealDark, fontSize: 9, fontWeight: '700' }, headerUser: { flexDirection: 'row', gap: 7, alignItems: 'center' }, headerAvatar: { width: 31, height: 31, borderRadius: 20, backgroundColor: '#DDEDE8', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: COLORS.tealDark, fontSize: 9, fontWeight: '800' }, headerName: { color: COLORS.deep, fontSize: 9, fontWeight: '700', maxWidth: 115 }, headerRole: { color: COLORS.muted, fontSize: 8, marginTop: 2, textTransform: 'capitalize' }, headerMenu: { color: COLORS.muted, fontSize: 14, marginLeft: 1 }, screen: { flex: 1, paddingHorizontal: 17, paddingTop: 17 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: COLORS.teal, fontSize: 9, letterSpacing: 1.4, fontWeight: '800' }, screenTitle: { color: COLORS.deep, fontSize: 24, fontWeight: '800', letterSpacing: -0.7, marginTop: 5 }, screenSubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 5, marginBottom: 13 }, appointmentShortcut: { width: 36, height: 36, backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, shortcutIcon: { color: COLORS.teal, fontSize: 18 },
  searchInputWrap: { height: 43, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11 }, searchIcon: { color: '#849692', fontSize: 24, marginRight: 7, lineHeight: 25 }, searchInput: { flex: 1, color: COLORS.ink, fontSize: 11 }, specialtyRow: { gap: 7, paddingVertical: 11 }, specialtyChip: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: 'white', paddingHorizontal: 11, paddingVertical: 7 }, specialtyChipActive: { backgroundColor: COLORS.mint, borderColor: '#C9E0D9' }, specialtyText: { color: '#788984', fontSize: 9, fontWeight: '600' }, specialtyTextActive: { color: COLORS.tealDark },
  mapToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }, patientMapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, locationChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 7, paddingHorizontal: 9, height: 32 }, locationPin: { color: COLORS.teal, fontSize: 16 }, locationText: { color: COLORS.body, fontSize: 9, fontWeight: '600' }, mapListToggle: { flexDirection: 'row', backgroundColor: '#E9EFED', borderRadius: 7, padding: 3 }, toggleButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 5 }, toggleActive: { backgroundColor: 'white' }, toggleText: { color: COLORS.muted, fontSize: 9, fontWeight: '600' }, toggleTextActive: { color: COLORS.ink }, mapFrame: { height: 205, borderRadius: 13, overflow: 'hidden', borderColor: COLORS.line, borderWidth: 1 }, map: { flex: 1 }, mapCount: { position: 'absolute', top: 9, left: 9, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'white' }, mapCountText: { color: COLORS.deep, fontSize: 9, fontWeight: '700' }, resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 7 }, resultsTitle: { color: COLORS.deep, fontSize: 11, fontWeight: '700' }, resultsSub: { color: COLORS.muted, fontSize: 9, fontWeight: '400' }, demoLabel: { color: COLORS.teal, fontSize: 8, fontWeight: '800', letterSpacing: 1 }, doctorResults: { flex: 1 },
  doctorCard: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 12, marginBottom: 9 }, doctorCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, doctorAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F2EF', alignItems: 'center', justifyContent: 'center' }, doctorAvatarText: { color: '#477D73', fontSize: 11, fontWeight: '800' }, nameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }, cardTitle: { color: COLORS.deep, fontSize: 11, fontWeight: '800', flexShrink: 1 }, cardSubtitle: { color: '#788A86', fontSize: 9, marginTop: 4 }, addressText: { color: '#94A09E', fontSize: 8, marginTop: 4, lineHeight: 12 }, verified: { color: COLORS.green, fontSize: 8, fontWeight: '800' }, distanceText: { color: COLORS.teal, fontSize: 8, fontWeight: '800', marginTop: 2 }, cardFooter: { borderTopColor: '#F0F3F2', borderTopWidth: 1, marginTop: 10, paddingTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, nextAvailable: { color: '#6C807B', fontSize: 9 }, greenDot: { color: '#70B09A', fontSize: 8 }, bookButton: { backgroundColor: COLORS.teal, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 }, bookButtonText: { color: 'white', fontSize: 8, fontWeight: '700' }, emptyCard: { backgroundColor: 'white', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9E4E1', borderRadius: 11, padding: 20, alignItems: 'center', marginTop: 10 }, emptyTitle: { color: COLORS.deep, fontSize: 12, fontWeight: '800' }, emptyCopy: { color: COLORS.muted, fontSize: 10, textAlign: 'center', lineHeight: 15, marginTop: 6 },
  bottomNav: { height: 59, borderTopColor: COLORS.line, borderTopWidth: 1, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 4 : 0 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, navIcon: { fontSize: 18, color: '#9AA7A4' }, navIconActive: { color: COLORS.teal }, navLabel: { color: '#9AA7A4', fontSize: 8, fontWeight: '600' }, navLabelActive: { color: COLORS.teal, fontWeight: '800' },
  assistantDock: { minHeight: 94, backgroundColor: '#303239', borderColor: '#4A4D57', borderWidth: 1, borderRadius: 23, marginHorizontal: 1, marginTop: 8, marginBottom: 9, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 9, justifyContent: 'space-between', shadowColor: '#202127', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }, assistantPrompt: { minHeight: 34, maxHeight: 65, paddingHorizontal: 7, paddingTop: 3, color: 'white', fontSize: 14, textAlignVertical: 'top' }, assistantDockActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }, assistantAddButton: { width: 40, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#484B54' }, assistantAddText: { color: '#F0F0F2', fontSize: 26, lineHeight: 30, fontWeight: '300' }, assistantMicButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }, assistantMicText: { color: '#E4E5E8', fontSize: 17 }, assistantSendButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }, assistantSendText: { color: 'white', fontSize: 16 }, chatScreen: { flex: 1, backgroundColor: COLORS.canvas }, chatHeader: { minHeight: 53, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.line, backgroundColor: 'white' }, chatBack: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, chatBackGlyph: { color: COLORS.deep, fontSize: 30, lineHeight: 33 }, chatHeaderTitle: { color: COLORS.deep, fontSize: 14, fontWeight: '800' }, chatHeaderBalance: { width: 38, height: 38 }, chatMessages: { flex: 1 }, chatMessagesContent: { padding: 16, gap: 10, paddingBottom: 22 }, chatNotice: { backgroundColor: '#FFF8EA', borderColor: '#F0E2C3', borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 6 }, chatNoticeTitle: { color: '#8C6B2B', fontWeight: '800', fontSize: 10, marginBottom: 4 }, chatNoticeText: { color: '#7D704F', fontSize: 9, lineHeight: 14 }, assistantBubble: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, borderBottomLeftRadius: 4, padding: 11 }, patientBubble: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: COLORS.mint, borderRadius: 14, borderBottomRightRadius: 4, padding: 11 }, emergencyBubble: { backgroundColor: '#FFF0EE', borderColor: '#F1C8C2' }, chatLevel: { color: COLORS.muted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '800', marginBottom: 5 }, emergencyLevel: { color: COLORS.red }, chatBubbleText: { color: COLORS.body, fontSize: 11, lineHeight: 17 }, chatComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: COLORS.line }, chatInput: { flex: 1, minHeight: 42, maxHeight: 100, borderRadius: 20, backgroundColor: COLORS.canvas, paddingHorizontal: 16, paddingVertical: 11, color: COLORS.ink, fontSize: 12 }, chatSend: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center' }, chatSendDisabled: { opacity: 0.55 }, chatSendText: { color: 'white', fontSize: 17 }, chatLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }, chatLoadingText: { color: COLORS.muted, fontSize: 10 }, profileModalCard: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 19, paddingBottom: 28 },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 11, marginBottom: 17 }, statCard: { flex: 1, backgroundColor: 'white', borderColor: COLORS.line, borderWidth: 1, borderRadius: 10, padding: 13 }, statValue: { color: COLORS.deep, fontSize: 22, fontWeight: '800' }, statLabel: { color: COLORS.muted, fontSize: 9, marginTop: 4 }, quickActions: { gap: 8, marginBottom: 20 }, quickAction: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, padding: 12, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, quickIcon: { color: COLORS.teal, fontSize: 15, width: 22, textAlign: 'center' }, quickTitle: { flex: 1, color: COLORS.deep, fontWeight: '700', fontSize: 10 }, quickArrow: { color: COLORS.muted, fontSize: 17 }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, marginBottom: 8 },
  appointmentCard: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 13, marginBottom: 9 }, appointmentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20 }, statusText: { fontSize: 8, fontWeight: '800' }, appointmentMeta: { borderTopWidth: 1, borderTopColor: '#F0F3F2', marginTop: 10, paddingTop: 8 }, dateText: { color: COLORS.body, fontSize: 9, fontWeight: '600' }, actionRow: { flexDirection: 'row', gap: 7, marginTop: 11 }, acceptButton: { backgroundColor: COLORS.mint, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 6 }, acceptText: { color: COLORS.tealDark, fontSize: 9, fontWeight: '800' }, declineButton: { backgroundColor: '#F8EEEE', paddingVertical: 8, paddingHorizontal: 13, borderRadius: 6 }, declineText: { color: COLORS.red, fontSize: 9, fontWeight: '800' },
  profileCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 14, marginTop: 15 }, infoCard: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, paddingHorizontal: 14, marginTop: 10 }, infoRow: { paddingVertical: 12, borderBottomColor: '#F0F3F2', borderBottomWidth: 1 }, infoLabel: { color: COLORS.muted, fontSize: 9 }, infoValue: { color: COLORS.deep, fontWeight: '700', fontSize: 10, marginTop: 4 }, formCard: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 14, marginTop: 14 }, permissionBox: { backgroundColor: '#F1F7F5', borderWidth: 1, borderColor: '#E2EEE9', borderRadius: 9, padding: 11, color: '#69807A', fontSize: 9, lineHeight: 15, marginVertical: 12 }, permissionStrong: { color: '#3F7167', fontWeight: '800' }, teamMember: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 12, marginBottom: 8 }, teamBadge: { color: COLORS.teal, fontSize: 7, fontWeight: '800', letterSpacing: 0.8 }, slotRow: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 13, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, removeSlot: { color: COLORS.red, fontSize: 20, paddingHorizontal: 5 },
  modalShade: { flex: 1, backgroundColor: '#15363370', justifyContent: 'flex-end' }, modalCard: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 }, modalHandle: { alignSelf: 'center', width: 39, height: 4, borderRadius: 2, backgroundColor: '#D5DEDB', marginBottom: 17 }, modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, closeText: { color: COLORS.muted, fontSize: 25, paddingHorizontal: 5 }, modalDoctor: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F7FAF9', borderRadius: 10, padding: 11, marginVertical: 14 }, slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }, slotChip: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 7, paddingVertical: 9, paddingHorizontal: 9 }, slotChipSelected: { backgroundColor: COLORS.mint, borderColor: '#AED2C7' }, slotText: { color: COLORS.body, fontSize: 9, fontWeight: '600' }, slotTextSelected: { color: COLORS.tealDark, fontWeight: '800' }, disclaimer: { color: COLORS.muted, fontSize: 9, lineHeight: 15, marginTop: 15, marginBottom: 14 },
});
