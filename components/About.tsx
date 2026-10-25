import React from 'react';
import { 
  Building2, 
  User, 
  ExternalLink, 
  Github, 
  Code2, 
  Database, 
  Zap, 
  ShieldCheck, 
  Smartphone, 
  AlertTriangle, 
  Layers, 
  CheckCircle2, 
  Boxes 
} from 'lucide-react';
import { useI18n } from '../i18n';

const LOGO_URL = 'https://myjourney-api.atmajaya.ac.id/storage/20240705/0fecce437f9e4991781ea0291336233e89f7a14f.png';
const GITHUB_PROFILE_URL = 'https://github.com/daniswaramp';
const GITHUB_REPO_URL = 'https://github.com/daniswaramp/grp-slab-stock-reconciliation';

const About: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="space-y-5 sm:space-y-8 animate-fadeIn pb-12 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 sm:mb-3">
              <Boxes size={13} />
              <span>PT Gunung Raja Paksi Tbk</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight">{t.about.title}</h1>
            <p className="text-xs sm:text-sm md:text-base text-blue-100/80 mt-1 max-w-2xl">{t.about.subtitle}</p>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <a
              href={GITHUB_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white text-gray-900 text-xs font-bold shadow-md hover:bg-blue-50 transition-all active:scale-95 w-full sm:w-auto"
            >
              <Github size={15} />
              <span>{t.about.githubProfileBtn}</span>
              <ExternalLink size={12} className="text-gray-400" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column (Logo & Author) + Right Column (App & Stack & Disclaimer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-start">
        
        {/* LEFT COLUMN: GRP Brand & Author Credentials */}
        <div className="lg:col-span-4 space-y-6">
          {/* Logo Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center flex flex-col items-center">
            <div className="w-full py-4 px-6 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center mb-5">
              <img 
                src={LOGO_URL} 
                alt="PT Gunung Raja Paksi Tbk" 
                className="h-16 md:h-20 object-contain drop-shadow-sm" 
              />
            </div>
            <h3 className="font-extrabold text-gray-900 text-base">{t.about.companyBadge}</h3>
            <p className="text-xs text-gray-500 font-medium mt-1">Indonesia's Leading Structural Steel Manufacturer</p>

            <div className="w-full border-t border-gray-100 my-4"></div>

            <div className="w-full flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-blue-50/60 border border-blue-100 text-blue-900">
                <span className="font-semibold text-gray-500">Divisi:</span>
                <span className="font-bold">Steel Mill Operations</span>
              </div>
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-indigo-50/60 border border-indigo-100 text-indigo-900">
                <span className="font-semibold text-gray-500">Departemen:</span>
                <span className="font-bold">PDTS</span>
              </div>
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-emerald-50/60 border border-emerald-100 text-emerald-900">
                <span className="font-semibold text-gray-500">Kolaborator:</span>
                <span className="font-bold">Departemen PPIC</span>
              </div>
            </div>
          </div>

          {/* Author & Credentials Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <User size={24} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">{t.about.authorTitle}</span>
                <h4 className="font-black text-gray-900 text-base">{t.about.authorName}</h4>
                <p className="text-xs text-gray-500 font-semibold">{t.about.authorRole}</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {t.about.authorDesc}
            </p>

            <div className="mt-5 space-y-2.5">
              <a
                href={GITHUB_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-900 hover:bg-gray-900 hover:text-white transition-all text-xs font-bold text-gray-700 group"
              >
                <div className="flex items-center gap-2">
                  <Github size={16} />
                  <span>GitHub: @daniswaramp</span>
                </div>
                <ExternalLink size={13} className="text-gray-400 group-hover:text-white" />
              </a>

              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold text-blue-800 group"
              >
                <div className="flex items-center gap-2">
                  <Code2 size={16} />
                  <span>{t.about.githubRepoBtn}</span>
                </div>
                <ExternalLink size={13} className="text-blue-500 group-hover:text-white" />
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: System Overview, Architecture Stack & Corporate Disclaimer */}
        <div className="lg:col-span-8 space-y-6">

          {/* System Overview */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-7">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Building2 size={18} />
              </div>
              <h3 className="font-extrabold text-gray-900 text-lg">{t.about.systemOverviewTitle}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {t.about.systemOverviewText}
            </p>
          </div>

          {/* Tech Stack Grid */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 text-lg">{t.about.techStackTitle}</h3>
                <p className="text-xs text-gray-500">Enterprise Full-Stack Architecture on Modern Serverless Infrastructure</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Frontend Card */}
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                  <Code2 size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">Frontend Stack</h4>
                  <p className="text-xs font-semibold text-gray-800">{t.about.frontendStack}</p>
                </div>
              </div>

              {/* Edge Backend Card */}
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                  <Zap size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">Serverless Edge API</h4>
                  <p className="text-xs font-semibold text-gray-800">{t.about.backendStack}</p>
                </div>
              </div>

              {/* Database Card */}
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                  <Database size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">Cloud Database</h4>
                  <p className="text-xs font-semibold text-gray-800">{t.about.databaseStack}</p>
                </div>
              </div>

              {/* Real-Time Sync Card */}
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700 shrink-0">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">Real-Time Event Engine</h4>
                  <p className="text-xs font-semibold text-gray-800">{t.about.realtimeStack}</p>
                </div>
              </div>

              {/* Mobile Optimization Card */}
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex items-start gap-3 md:col-span-2">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0">
                  <Smartphone size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">Yard Cellular & Offline Handling</h4>
                  <p className="text-xs font-semibold text-gray-800">{t.about.mobileStack}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Explicit Legal & Corporate Independence Disclaimer */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200/80 rounded-2xl p-6 md:p-7 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                <ShieldCheck size={22} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Official Independence Statement</span>
                <h3 className="font-black text-amber-950 text-base md:text-lg">{t.about.disclaimerTitle}</h3>
              </div>
            </div>

            <div className="space-y-3 text-xs md:text-sm text-amber-950/90 leading-relaxed font-medium">
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-2 shrink-0"></span>
                <p>{t.about.disclaimerParagraph1}</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-2 shrink-0"></span>
                <p>{t.about.disclaimerParagraph2}</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-2 shrink-0"></span>
                <p>{t.about.disclaimerParagraph3}</p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-amber-200/60 flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold text-amber-800">
              <span>Author: Daniswara M.P. (PDTS Engineer)</span>
              <a 
                href={GITHUB_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-950 transition-colors inline-flex items-center gap-1"
              >
                github.com/daniswaramp <ExternalLink size={10} />
              </a>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default About;
