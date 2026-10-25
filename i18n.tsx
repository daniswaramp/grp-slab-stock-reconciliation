import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'id' | 'en';

export interface Translations {
  nav: {
    dashboard: string;
    opnameSlab: string;
    opnameList: string;
    setting: string;
    database: string;
  };
  header: {
    title: string;
    subtitle: string;
    online: string;
    connectedUsers: string;
    activeUsers: string;
    you: string;
    signOut: string;
    lockSystem: string;
    unlockSystem: string;
    language: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    liveUpdates: string;
    announcement: string;
    setAnnouncement: string;
    activeOnlineUsers: string;
    synchronized: string;
    missingData: string;
    notAvailable: string;
    userActivityTitle: string;
    userActivitySubtitle: string;
    inspectorName: string;
    lastSeen: string;
    status: string;
    active: string;
    offline: string;
    noUsersOnline: string;
    progressTitle: string;
    progressSubtitle: string;
    opnamed: string;
    remaining: string;
    syncLabel: string;
    missingLabel: string;
  };
  opnameSlab: {
    title: string;
    searchPlaceholder: string;
    activeSelection: string;
    sapRecord: string;
    motherSlab: string;
    cutStock: string;
    synchronize: string;
    missingData: string;
    notAvailable: string;
    duplicateWarning: string;
    duplicateDetails: (user: string, date: string, time: string, status: string, loc: string) => string;
    matrixTitle: string;
    selectBatchHint: string;
    batchId: string;
    grade: string;
    dimensions: string;
    weight: string;
    location: string;
    gangBaris: string;
    remarks: string;
    evidencePhoto: string;
    submit: string;
    submitting: string;
    cancel: string;
    modalTitle: (type: string) => string;
    actualThick: string;
    actualWidth: string;
    actualLength: string;
    actualGrade: string;
    dimensionMatch: string;
    gradeMatch: string;
    successSaved: string;
  };
  opnameList: {
    title: string;
    subtitle: string;
    sortByDate: string;
    sortByTime: string;
    asc: string;
    desc: string;
    exportExcel: string;
    exportCsv: string;
    backup: string;
    saveBackup: string;
    loadBackup: string;
    filters: string;
    startDate: string;
    endDate: string;
    inspector: string;
    batchId: string;
    status: string;
    all: string;
    verification: string;
    date: string;
    time: string;
    user: string;
    photo: string;
    actions: string;
    rowsPerPage: string;
    noRecords: string;
  };
  database: {
    title: string;
    subtitle: string;
    sapTab: string;
    motherTab: string;
    cutTab: string;
    uploadData: string;
    clearData: string;
    searchPlaceholder: string;
    totalRecords: string;
    totalWeight: string;
  };
  setting: {
    usersTab: string;
    locationsTab: string;
    lockTab: string;
    pendingTab: string;
    resetsTab: string;
    registeredUsers: string;
    presence: string;
    accountState: string;
    onlineNow: string;
    offline: string;
    active: string;
    disabled: string;
    pending: string;
    resetPassword: string;
    deleteAccount: string;
    activeSessions: string;
    forceDisconnect: string;
    locationsManagement: string;
    addLocation: string;
    newLocationPlaceholder: string;
    systemLockTitle: string;
    systemLockDesc: string;
  };
}

const idTranslations: Translations = {
  nav: {
    dashboard: 'Dashboard',
    opnameSlab: 'Opname Slab',
    opnameList: 'Riwayat Opname',
    setting: 'Pengaturan',
    database: 'Database Stok'
  },
  header: {
    title: 'PPIC Slab Stock Opname',
    subtitle: 'Portal Rekonsiliasi',
    online: 'Online',
    connectedUsers: 'Pengguna Terhubung',
    activeUsers: 'Pengguna Aktif',
    you: 'Anda',
    signOut: 'Keluar',
    lockSystem: 'Kunci Sistem',
    unlockSystem: 'Buka Kunci Sistem',
    language: 'Bahasa'
  },
  dashboard: {
    title: 'Ringkasan Dashboard',
    subtitle: 'Pemantauan real-time perkembangan rekonsiliasi',
    liveUpdates: 'Pembaruan Langsung Aktif',
    announcement: 'Pengumuman',
    setAnnouncement: 'Atur Pengumuman',
    activeOnlineUsers: 'Pengguna Online Aktif',
    synchronized: 'Tersinkronisasi',
    missingData: 'Data Hilang (Missing)',
    notAvailable: 'Tidak Ditemukan (NA)',
    userActivityTitle: 'Status Aktivitas Pengguna',
    userActivitySubtitle: 'Pemantauan langsung inspektur yang terhubung',
    inspectorName: 'Nama Inspektur',
    lastSeen: 'Terakhir Aktif',
    status: 'Status',
    active: 'Aktif',
    offline: 'Offline',
    noUsersOnline: 'Tidak ada pengguna yang sedang online',
    progressTitle: 'Kemajuan Keseluruhan',
    progressSubtitle: 'Distribusi status rekonsiliasi opname',
    opnamed: 'Selesai Opname',
    remaining: 'Sisa Belum Opname',
    syncLabel: 'Sinkron',
    missingLabel: 'Missing'
  },
  opnameSlab: {
    title: 'Pindai atau Masukkan Kode Slab',
    searchPlaceholder: 'Masukkan kode slab / batch ID untuk mencari...',
    activeSelection: 'PILIHAN AKTIF',
    sapRecord: 'Catatan SAP',
    motherSlab: 'Mother Slab',
    cutStock: 'Cut Stock',
    synchronize: 'SINKRONISASI',
    missingData: 'DATA HILANG',
    notAvailable: 'TIDAK TERSEDIA',
    duplicateWarning: 'Peringatan Duplikasi: Batch ID ini sudah pernah di-opname!',
    duplicateDetails: (user, date, time, status, loc) =>
      `Telah dicatat oleh ${user} pada ${date} pukul ${time} (Status: ${status} di ${loc}).`,
    matrixTitle: 'Matriks Rekonsiliasi',
    selectBatchHint: 'Klik baris di bawah untuk memilih Batch ID yang ingin direkonsiliasi:',
    batchId: 'Batch ID',
    grade: 'Grade',
    dimensions: 'Dimensi (T x W x L)',
    weight: 'Berat (Ton)',
    location: 'Lokasi',
    gangBaris: 'Gang / Baris',
    remarks: 'Catatan / Remarks',
    evidencePhoto: 'Foto Bukti Fisik',
    submit: 'Simpan Rekaman Opname',
    submitting: 'Menyimpan...',
    cancel: 'Batal',
    modalTitle: (type) => `Konfirmasi Opname: ${type}`,
    actualThick: 'Tebal Aktual (mm)',
    actualWidth: 'Lebar Aktual (mm)',
    actualLength: 'Panjang Aktual (mm)',
    actualGrade: 'Grade Aktual',
    dimensionMatch: 'Dimensi Sesuai Fisik',
    gradeMatch: 'Grade Sesuai Fisik',
    successSaved: 'Rekaman opname berhasil disimpan.'
  },
  opnameList: {
    title: 'Riwayat Rekonsiliasi Opname',
    subtitle: 'Daftar lengkap rekaman slab yang telah di-opname',
    sortByDate: 'Urut Tanggal',
    sortByTime: 'Urut Waktu',
    asc: 'Naik (Lama → Baru)',
    desc: 'Turun (Terbaru)',
    exportExcel: 'Ekspor Excel',
    exportCsv: 'Ekspor CSV',
    backup: 'Cadangan',
    saveBackup: 'Simpan Cadangan',
    loadBackup: 'Pulihkan Cadangan',
    filters: 'Filter Data',
    startDate: 'Tgl Mulai',
    endDate: 'Tgl Akhir',
    inspector: 'Inspektur',
    batchId: 'Batch ID',
    status: 'Status',
    all: 'Semua',
    verification: 'Verifikasi',
    date: 'Tanggal',
    time: 'Waktu',
    user: 'Inspektur',
    photo: 'Foto',
    actions: 'Aksi',
    rowsPerPage: 'Baris per halaman:',
    noRecords: 'Tidak ada data rekonsiliasi yang cocok dengan filter.'
  },
  database: {
    title: 'Manajemen Database Stok',
    subtitle: 'Kelola data referensi SAP, Mother Slab, dan Cut Slab',
    sapTab: 'SAP Stock',
    motherTab: 'Mother Slab',
    cutTab: 'Cut Slab',
    uploadData: 'Unggah Data Excel',
    clearData: 'Kosongkan Data',
    searchPlaceholder: 'Cari Batch ID atau Grade...',
    totalRecords: 'Total Baris Data',
    totalWeight: 'Total Berat'
  },
  setting: {
    usersTab: 'Akun Pengguna',
    locationsTab: 'Lokasi Yard',
    lockTab: 'Kunci Sistem',
    pendingTab: 'Persetujuan Akun',
    resetsTab: 'Reset Password',
    registeredUsers: 'Daftar Akun Terdaftar',
    presence: 'Keberadaan',
    accountState: 'Status Akun',
    onlineNow: 'Online',
    offline: 'Offline',
    active: 'Aktif',
    disabled: 'Dinonaktifkan',
    pending: 'Menunggu',
    resetPassword: 'Ubah Password',
    deleteAccount: 'Hapus Akun',
    activeSessions: 'Sesi Online Aktif',
    forceDisconnect: 'Putuskan Sesi',
    locationsManagement: 'Manajemen Lokasi Yard',
    addLocation: 'Tambah Lokasi',
    newLocationPlaceholder: 'Nama lokasi baru (mis. Yard 3 - Bay A)...',
    systemLockTitle: 'Mode Kunci Sistem Seluruh Aplikasi',
    systemLockDesc: 'Bila aktif, hanya Admin yang dapat mengubah atau menambah data opname.'
  }
};

const enTranslations: Translations = {
  nav: {
    dashboard: 'Dashboard',
    opnameSlab: 'Opname Slab',
    opnameList: 'Opname History',
    setting: 'Settings',
    database: 'Stock Database'
  },
  header: {
    title: 'PPIC Slab Stock Opname',
    subtitle: 'Reconciliation Portal',
    online: 'Online',
    connectedUsers: 'Connected Users',
    activeUsers: 'Active Users',
    you: 'You',
    signOut: 'Sign Out',
    lockSystem: 'Lock System',
    unlockSystem: 'Unlock System',
    language: 'Language'
  },
  dashboard: {
    title: 'Dashboard Overview',
    subtitle: 'Real-time monitoring of reconciliation progress',
    liveUpdates: 'Live Updates Active',
    announcement: 'Announcement',
    setAnnouncement: 'Set Announcement',
    activeOnlineUsers: 'Active Online Users',
    synchronized: 'Synchronized',
    missingData: 'Missing Data',
    notAvailable: 'Not Available',
    userActivityTitle: 'User Activity Status',
    userActivitySubtitle: 'Live monitoring of connected inspectors',
    inspectorName: 'Inspector Name',
    lastSeen: 'Last Active',
    status: 'Status',
    active: 'Active',
    offline: 'Offline',
    noUsersOnline: 'No users currently online',
    progressTitle: 'Overall Progress',
    progressSubtitle: 'Distribution of reconciliation statuses',
    opnamed: 'Opnamed',
    remaining: 'Remaining',
    syncLabel: 'Sync',
    missingLabel: 'Missing'
  },
  opnameSlab: {
    title: 'Scan or Enter Slab Code',
    searchPlaceholder: 'Enter slab / batch ID to search...',
    activeSelection: 'ACTIVE SELECTION',
    sapRecord: 'SAP Record',
    motherSlab: 'Mother Slab',
    cutStock: 'Cut Stock',
    synchronize: 'SYNCHRONIZE',
    missingData: 'MISSING DATA',
    notAvailable: 'NOT AVAILABLE',
    duplicateWarning: 'Duplicate Warning: This Batch ID has already been opnamed!',
    duplicateDetails: (user, date, time, status, loc) =>
      `Recorded by ${user} on ${date} at ${time} (Status: ${status} in ${loc}).`,
    matrixTitle: 'Reconciliation Matrix',
    selectBatchHint: 'Click a row below to select the target Batch ID for reconciliation:',
    batchId: 'Batch ID',
    grade: 'Grade',
    dimensions: 'Dimensions (T x W x L)',
    weight: 'Weight (Tons)',
    location: 'Location',
    gangBaris: 'Bay / Row',
    remarks: 'Remarks',
    evidencePhoto: 'Physical Evidence Photo',
    submit: 'Save Opname Record',
    submitting: 'Saving...',
    cancel: 'Cancel',
    modalTitle: (type) => `Opname Confirmation: ${type}`,
    actualThick: 'Actual Thickness (mm)',
    actualWidth: 'Actual Width (mm)',
    actualLength: 'Actual Length (mm)',
    actualGrade: 'Actual Grade',
    dimensionMatch: 'Dimensions Match Physical',
    gradeMatch: 'Grade Matches Physical',
    successSaved: 'Opname record saved successfully.'
  },
  opnameList: {
    title: 'Opname Reconciliation History',
    subtitle: 'Complete list of all verified slab records',
    sortByDate: 'Sort Date',
    sortByTime: 'Sort Time',
    asc: 'Ascending (Oldest First)',
    desc: 'Descending (Newest First)',
    exportExcel: 'Export Excel',
    exportCsv: 'Export CSV',
    backup: 'Backup',
    saveBackup: 'Save Backup',
    loadBackup: 'Restore Backup',
    filters: 'Filter Records',
    startDate: 'Start Date',
    endDate: 'End Date',
    inspector: 'Inspector',
    batchId: 'Batch ID',
    status: 'Status',
    all: 'All',
    verification: 'Verification',
    date: 'Date',
    time: 'Time',
    user: 'Inspector',
    photo: 'Photo',
    actions: 'Actions',
    rowsPerPage: 'Rows per page:',
    noRecords: 'No reconciliation records matching your filters.'
  },
  database: {
    title: 'Stock Database Management',
    subtitle: 'Manage reference data for SAP, Mother Slab, and Cut Slab',
    sapTab: 'SAP Stock',
    motherTab: 'Mother Slab',
    cutTab: 'Cut Slab',
    uploadData: 'Upload Excel Data',
    clearData: 'Clear Table Data',
    searchPlaceholder: 'Search Batch ID or Grade...',
    totalRecords: 'Total Records',
    totalWeight: 'Total Weight'
  },
  setting: {
    usersTab: 'User Accounts',
    locationsTab: 'Yard Locations',
    lockTab: 'System Lock',
    pendingTab: 'Pending Approvals',
    resetsTab: 'Password Resets',
    registeredUsers: 'Registered User Accounts',
    presence: 'Presence',
    accountState: 'Account State',
    onlineNow: 'Online Now',
    offline: 'Offline',
    active: 'Active',
    disabled: 'Disabled',
    pending: 'Pending',
    resetPassword: 'Reset Password',
    deleteAccount: 'Delete Account',
    activeSessions: 'Active Online Sessions',
    forceDisconnect: 'Force Disconnect',
    locationsManagement: 'Yard Locations Management',
    addLocation: 'Add Location',
    newLocationPlaceholder: 'New location name (e.g. Yard 3 - Bay A)...',
    systemLockTitle: 'Global System Lock Mode',
    systemLockDesc: 'When active, only Administrators can submit or modify opname data.'
  }
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType>({
  language: 'id',
  setLanguage: () => {},
  t: idTranslations
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem('slab_opname_lang') as Language) || 'id';
    }
    return 'id';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('slab_opname_lang', lang);
    }
  };

  const t = language === 'en' ? enTranslations : idTranslations;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
