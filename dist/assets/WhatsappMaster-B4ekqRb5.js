import{u as q,a as Q,r,j as e,S as _,Y as z,aV as U}from"./index-DjiuCalu.js";import{c as H}from"./masterPermissions-DlO3FJ37.js";const N="/quality/complaints/form",Y=`🚨 *QC Complaint Alert*

*Complaint No.:* {{complaintNo}}
*Complaint Date:* {{dateOfComplaint}}
*Job / Lot No.:* {{lotNo}}
*Party:* {{partyName}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Nature:* {{natureOfComplaint}}
*Quantity:* {{quantity}}
*Area:* {{areaOfIssue}}
*Issue Details:* {{issueDetails}}
*Photos:* Attached separately.

Please review this complaint and take the necessary action.`,K="/quality/boardline-qc/form",J=`📋 *BOARDLINE QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP Code:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Size Details*
*Standard (Flap - Height - Flap):* {{standard}}
*Actual - Operator Side:* {{flapHeightFlapOperatorSide}}
*Actual - Drive Side:* {{flapHeightFlapDriveSide}}

*Cutting Size Required:* {{cuttingSizeRequired}}
*Cutting Size Achieved:* {{cuttingSizeMm}}

*Board Details*
*B.GSM:* {{boardGsm}}
*Type of Flute:* {{typeOfFlute}}
*Board Thickness:* {{boardThickness}}
*Moisture:* {{moisture}}
*Sheet Weight:* {{sheetWeightGrams}}

*BOARDLINE REMARKS*
{{boardlineRemarks}}

*QC Person:* {{qcPerson}}

*PRINTING ARTWORK*
{{printingArtwork}}`,V="/quality/printing-qc/form",$=`🖨️ *PRINTING QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Box Size Details*
*Standard Box Size (L x W x H):* {{standardBoxSize}}
*Box Size Achieved (L x W x H):* {{boxSizeAchieved}}

*CS / BS Details*
*CS (Standard):* {{csStandard}}
*BS (Standard):* {{bsStandard}}
*BS Achieved:* {{bsAchieved}}

*Board Details*
*Board Thickness (Before):* {{boardThicknessBefore}}
*Board Thickness:* {{boardThickness}}
*Box Weight (Grams):* {{boxWeightGrams}}

*Printing Colour Details*
*Printing Colour 1 (Standard):* {{printingColor1Standard}}
*Colour 1 (Actual):* {{colour1Actual}}

*STANDARD ARTWORK*
{{standardArtwork}}

*QC Person:* {{qcPerson}}
*Operator Name:* {{operatorName}}`;function I(n){return n===K?J:n===V?$:Y}function X(n){const p=[],i=new Set,u=(a,d)=>{if("items"in a){a.items.forEach(j=>u(j,a.section));return}!a.href||i.has(a.href)||(i.add(a.href),p.push({label:`${d} / ${a.name}`,value:a.href}))};return n.forEach(a=>a.items.forEach(d=>u(d,a.section))),p.sort((a,d)=>a.label.localeCompare(d.label))}function ae(){const{user:n}=q(),p=H(n?.role),[i,,,u]=Q("whatsapp_configs",[]),[a,d]=r.useState(""),[j,S]=r.useState(!1),[o,y]=r.useState(null),[w,m]=r.useState(""),[A,x]=r.useState(""),[k,h]=r.useState(""),[E,b]=r.useState(""),[M,c]=r.useState(""),[D,g]=r.useState("Yes"),[P,T]=r.useState(!1),L=r.useMemo(()=>X(U),[]),v=r.useMemo(()=>{const s=a.trim().toLowerCase();return[...i].filter(t=>!s||[t.loginId,t.groupId,t.menu,t.message].some(f=>String(f||"").toLowerCase().includes(s))).sort((t,f)=>String(t.loginId).localeCompare(String(f.loginId)))},[i,a]),O=()=>{y(null),m(""),x(""),h(""),b(N),c(I(N)),g("Yes"),S(!1)},B=()=>{y(null),m(""),x(""),h(""),b(N),c(I(N)),g("Yes"),S(!0)},W=s=>{y(s.id),m(s.loginId),x(""),h(s.groupId),b(s.menu),c(s.message),g(s.active==="No"?"No":"Yes"),S(!0)},G=async s=>{s.preventDefault();const t={loginId:w.trim(),pass:A,groupId:k.trim(),menu:E.trim(),message:M.trim()};if(!t.loginId||!t.groupId||!t.menu||!t.message||!o&&!t.pass){alert("LoginID, Pass, GroupId, Menu, and Message are required.");return}if(i.some(l=>l.id!==o&&l.loginId.trim().toLowerCase()===t.loginId.toLowerCase()&&l.groupId.trim().toLowerCase()===t.groupId.toLowerCase()&&l.menu===t.menu)){alert("A WhatsApp configuration already exists for this LoginID, GroupId, and Menu.");return}T(!0);try{const l=new Date().toISOString(),Z=o?i.find(C=>C.id===o):void 0,F={...{id:o||crypto.randomUUID(),loginId:t.loginId,pass:"********",groupId:t.groupId,menu:t.menu,message:t.message,active:D,updatedBy:n?.name||n?.email||"System User",updateTimestamp:l},...t.pass?{pass:t.pass}:{}},R=await fetch("/api/whatsapp-configs",{method:"POST",headers:{"Content-Type":"application/json",...z()},body:JSON.stringify(F)});if(!R.ok){const C=await R.json().catch(()=>({}));throw new Error(C?.error||"Failed to save WhatsApp configuration.")}await u.refresh({force:!0}),O()}catch(l){console.error("Failed to save WhatsApp configuration:",l),alert("Failed to save WhatsApp configuration.")}finally{T(!1)}};return p?e.jsx("div",{className:"space-y-6",children:j?e.jsxs("div",{className:"bg-white p-6 rounded-[24px] shadow-sm border border-slate-200",children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-start gap-4 mb-8",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:o?"Edit WhatsApp Configuration":"New WhatsApp Configuration"}),e.jsx("p",{className:"text-slate-500 mt-1",children:"Save a message template for one application menu."})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("button",{type:"button",onClick:O,className:"px-8 py-3 rounded-2xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Cancel"}),e.jsx("button",{type:"submit",form:"whatsapp-form",disabled:P,className:"px-8 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800 disabled:opacity-50",children:P?e.jsx(_,{size:18,className:"text-white"}):"Save"})]})]}),e.jsxs("form",{id:"whatsapp-form",onSubmit:G,className:"grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl",children:[e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["LoginID ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:w,onChange:s=>m(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Pass ",e.jsx("span",{className:"text-red-500",children:o?"":"*"})]}),e.jsx("input",{type:"password",value:A,onChange:s=>x(s.target.value),required:!o,placeholder:o?"Leave blank to keep current password":"Enter password",className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["GroupId ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:k,onChange:s=>h(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Menu ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsxs("select",{value:E,onChange:s=>{const t=s.target.value;b(t),o||c(I(t))},required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"",children:"Select menu"}),L.map(s=>e.jsx("option",{value:s.value,children:s.label},s.value))]})]}),e.jsxs("label",{className:"space-y-2 md:col-span-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Auto-message template ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("textarea",{value:M,onChange:s=>c(s.target.value),required:!0,rows:5,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsx("span",{className:"text-blue-700 font-bold",children:"Status"}),e.jsxs("select",{value:D,onChange:s=>g(s.target.value==="No"?"No":"Yes"),className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"Yes",children:"Active"}),e.jsx("option",{value:"No",children:"Inactive"})]})]})]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-center gap-4",children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:"WhatsApp Master"}),e.jsxs("div",{className:"flex flex-wrap items-center gap-3",children:[e.jsx("input",{value:a,onChange:s=>d(s.target.value),placeholder:"Search WhatsApp configuration",className:"w-[360px] max-w-full rounded-full border border-slate-300 px-6 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"}),e.jsx("button",{type:"button",onClick:B,className:"px-7 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800",children:"+ WhatsApp"})]})]}),e.jsxs("div",{className:"bg-white rounded-[22px] border border-slate-300 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-3 text-slate-600",children:["Showing ",v.length," entries"]}),e.jsx("div",{className:"table-sticky-scroll",children:e.jsxs("table",{className:"min-w-full border-collapse",children:[e.jsx("thead",{className:"sticky top-0 z-30",children:e.jsxs("tr",{className:"bg-indigo-700 text-white",children:[e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"LoginID"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Pass"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"GroupId"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Menu"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Message"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Status"}),e.jsx("th",{className:"px-4 py-4 text-right text-sm font-bold border-2 border-black",children:"Action"})]})}),e.jsx("tbody",{children:v.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:7,className:"px-6 py-10 text-center border-2 border-black",children:"No WhatsApp configurations found."})}):v.map(s=>e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-4 font-bold border-2 border-black",children:s.loginId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black tracking-widest",children:"********"}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.groupId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:L.find(t=>t.value===s.menu)?.label||s.menu}),e.jsx("td",{className:"px-4 py-4 border-2 border-black whitespace-pre-wrap max-w-[360px]",children:s.message}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.active==="No"?"Inactive":"Active"}),e.jsx("td",{className:"px-4 py-3 text-right border-2 border-black",children:e.jsx("button",{type:"button",onClick:()=>W(s),className:"px-6 py-2 rounded-xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Open"})})]},s.id))})]})})]})]})}):e.jsx("div",{className:"rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700",children:"You do not have permission to manage WhatsApp configurations."})}export{ae as WhatsappMaster};
