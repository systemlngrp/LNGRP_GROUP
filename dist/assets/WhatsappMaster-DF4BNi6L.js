import{u as $,a as K,r,j as e,S as J,Y as Q,aV as V}from"./index-CSZnReIT.js";import{c as X}from"./masterPermissions-DlO3FJ37.js";import{Q as Z,D as ee}from"./qcScore-BsigEKyg.js";const y="/quality/complaints/form",se=`🚨 *QC Complaint Alert*

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

Please review this complaint and take the necessary action.`,te="/quality/boardline-qc/form",ae=`📋 *BOARDLINE QC CHECK*

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
{{printingArtwork}}`,re="/quality/printing-qc/form",ne="/reports/printing-shift",oe=`*Printing Report ({{shiftHours}}) {{date}}*

{{jobLines}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`,le=`🖨️ *PRINTING QC CHECK*

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
*Operator Name:* {{operatorName}}`;function E(o){return o===Z?ee:o===ne?oe:o===te?ae:o===re?le:se}function ie(o){const b=[],m=new Set,h=(a,c)=>{if("items"in a){a.items.forEach(v=>h(v,a.section));return}!a.href||m.has(a.href)||(m.add(a.href),b.push({label:`${c} / ${a.name}`,value:a.href}))};return o.forEach(a=>a.items.forEach(c=>h(c,a.section))),b.sort((a,c)=>a.label.localeCompare(c.label))}function pe(){const{user:o}=$(),b=X(o?.role),[m,,,h]=K("whatsapp_configs",[]),[a,c]=r.useState(""),[v,C]=r.useState(!1),[d,I]=r.useState(null),[M,g]=r.useState(""),[P,f]=r.useState(""),[T,N]=r.useState(""),[D,S]=r.useState(""),[R,x]=r.useState(""),[L,j]=r.useState("Yes"),[O,_]=r.useState(!1),[w,B]=r.useState(null),[l,u]=r.useState(null),A=r.useMemo(()=>ie(V),[]),k=r.useMemo(()=>{const s=a.trim().toLowerCase();return[...m].filter(t=>!s||[t.loginId,t.groupId,t.menu,t.message].some(p=>String(p||"").toLowerCase().includes(s))).sort((t,p)=>String(t.loginId).localeCompare(String(p.loginId)))},[m,a]),F=()=>{I(null),g(""),f(""),N(""),S(y),x(E(y)),j("Yes"),C(!1)},q=()=>{I(null),g(""),f(""),N(""),S(y),x(E(y)),j("Yes"),C(!0)},U=s=>{I(s.id),g(s.loginId),f(""),N(s.groupId),S(s.menu),x(s.message),j(s.active==="No"?"No":"Yes"),C(!0)},z=async s=>{s.preventDefault();const t={loginId:M.trim(),pass:P,groupId:T.trim(),menu:D.trim(),message:R.trim()};if(!t.loginId||!t.groupId||!t.menu||!t.message||!d&&!t.pass){alert("LoginID, Pass, GroupId, Menu, and Message are required.");return}if(t.pass.trim()==="********"){alert("Enter the real Pass; the masked value cannot be saved as a password.");return}if(m.some(n=>n.id!==d&&n.loginId.trim().toLowerCase()===t.loginId.toLowerCase()&&n.groupId.trim().toLowerCase()===t.groupId.toLowerCase()&&n.menu===t.menu)){alert("A WhatsApp configuration already exists for this LoginID, GroupId, and Menu.");return}_(!0);try{const n=new Date().toISOString(),i={id:d||crypto.randomUUID(),loginId:t.loginId,groupId:t.groupId,menu:t.menu,message:t.message,active:L,updatedBy:o?.name||o?.email||"System User",updateTimestamp:n},G=t.pass?{...i,pass:t.pass}:i,W=await fetch("/api/whatsapp-configs",{method:"POST",headers:{"Content-Type":"application/json",...Q()},body:JSON.stringify(G)});if(!W.ok){const Y=await W.json().catch(()=>({}));throw new Error(Y?.error||"Failed to save WhatsApp configuration.")}await h.refresh({force:!0}),F()}catch(n){console.error("Failed to save WhatsApp configuration:",n);const i=n.message;alert(new Set(["Pass is required for a new WhatsApp configuration.","Enter the real Pass; the masked value cannot be saved as a password.","The stored Pass must be replaced. Enter the current Message Auto Sender password."]).has(i)?i:"Failed to save WhatsApp configuration.")}finally{_(!1)}},H=async s=>{if(s.active==="No"||w)return;B(s.id);const t=A.find(p=>p.value===s.menu)?.label||s.menu;u({kind:"sending",menuLabel:t});try{const n=await(await fetch(`/api/whatsapp-configs/${encodeURIComponent(s.id)}/send-current`,{method:"POST",headers:{"Content-Type":"application/json",...Q()}})).json().catch(()=>({})),i=String(n.status||"Failed");u(i==="Sent"?{kind:"success",menuLabel:t,message:"Message sent successfully."}:i==="No Current Data"?{kind:"no-current-data",menuLabel:t,message:"No current data is available for this template."}:i==="Not Configured"?{kind:"not-configured",menuLabel:t,message:"No active WhatsApp configuration or valid credentials found."}:{kind:"failure",menuLabel:t,message:n.error||"Message sending failed."})}catch{u({kind:"failure",menuLabel:t,message:"Message sending failed. Please try again."})}finally{B(null)}};return b?e.jsx("div",{className:"space-y-6",children:v?e.jsxs("div",{className:"bg-white p-6 rounded-[24px] shadow-sm border border-slate-200",children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-start gap-4 mb-8",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:d?"Edit WhatsApp Configuration":"New WhatsApp Configuration"}),e.jsx("p",{className:"text-slate-500 mt-1",children:"Save a message template for one application menu."})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("button",{type:"button",onClick:F,className:"px-8 py-3 rounded-2xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Cancel"}),e.jsx("button",{type:"submit",form:"whatsapp-form",disabled:O,className:"px-8 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800 disabled:opacity-50",children:O?e.jsx(J,{size:18,className:"text-white"}):"Save"})]})]}),e.jsxs("form",{id:"whatsapp-form",onSubmit:z,className:"grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl",children:[e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["LoginID ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:M,onChange:s=>g(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Pass ",e.jsx("span",{className:"text-red-500",children:d?"":"*"})]}),e.jsx("input",{type:"password",value:P,onChange:s=>f(s.target.value),required:!d,placeholder:d?"Leave blank to keep current password":"Enter password",className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["GroupId ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:T,onChange:s=>N(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Menu ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsxs("select",{value:D,onChange:s=>{const t=s.target.value;S(t),d||x(E(t))},required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"",children:"Select menu"}),A.map(s=>e.jsx("option",{value:s.value,children:s.label},s.value))]})]}),e.jsxs("label",{className:"space-y-2 md:col-span-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Auto-message template ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("textarea",{value:R,onChange:s=>x(s.target.value),required:!0,rows:5,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsx("span",{className:"text-blue-700 font-bold",children:"Status"}),e.jsxs("select",{value:L,onChange:s=>j(s.target.value==="No"?"No":"Yes"),className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"Yes",children:"Active"}),e.jsx("option",{value:"No",children:"Inactive"})]})]})]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-center gap-4",children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:"WhatsApp Master"}),e.jsxs("div",{className:"flex flex-wrap items-center gap-3",children:[e.jsx("input",{value:a,onChange:s=>c(s.target.value),placeholder:"Search WhatsApp configuration",className:"w-[360px] max-w-full rounded-full border border-slate-300 px-6 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"}),e.jsx("button",{type:"button",onClick:q,className:"px-7 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800",children:"+ WhatsApp"})]})]}),l?e.jsxs("div",{role:l.kind==="failure"?"alert":"status",className:`flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 font-semibold ${l.kind==="success"?"border-emerald-300 bg-emerald-50 text-emerald-800":l.kind==="failure"?"border-red-300 bg-red-50 text-red-800":l.kind==="sending"?"border-blue-300 bg-blue-50 text-blue-800":"border-amber-300 bg-amber-50 text-amber-800"}`,children:[e.jsx("span",{children:l.kind==="sending"?`Sending current ${l.menuLabel} message...`:`${l.menuLabel}: ${l.message}`}),l.kind!=="sending"?e.jsx("button",{type:"button",onClick:()=>u(null),"aria-label":"Dismiss send result",className:"shrink-0 rounded-lg px-2 text-lg leading-none hover:bg-black/10",children:"×"}):null]}):null,e.jsxs("div",{className:"bg-white rounded-[22px] border border-slate-300 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-3 text-slate-600",children:["Showing ",k.length," entries"]}),e.jsx("div",{className:"table-sticky-scroll",children:e.jsxs("table",{className:"min-w-full border-collapse",children:[e.jsx("thead",{className:"sticky top-0 z-30",children:e.jsxs("tr",{className:"bg-indigo-700 text-white",children:[e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"LoginID"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Pass"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"GroupId"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Menu"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Message"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Status"}),e.jsx("th",{className:"px-4 py-4 text-right text-sm font-bold border-2 border-black",children:"Action"})]})}),e.jsx("tbody",{children:k.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:7,className:"px-6 py-10 text-center border-2 border-black",children:"No WhatsApp configurations found."})}):k.map(s=>e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-4 font-bold border-2 border-black",children:s.loginId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black tracking-widest",children:"********"}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.groupId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:A.find(t=>t.value===s.menu)?.label||s.menu}),e.jsx("td",{className:"px-4 py-4 border-2 border-black whitespace-pre-wrap max-w-[360px]",children:s.message}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.active==="No"?"Inactive":"Active"}),e.jsx("td",{className:"px-4 py-3 text-right border-2 border-black",children:e.jsxs("div",{className:"flex flex-wrap justify-end gap-2",children:[e.jsx("button",{type:"button",onClick:()=>{H(s)},disabled:s.active==="No"||!!w,className:"px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50",children:w===s.id?"Sending...":"Send Current"}),e.jsx("button",{type:"button",onClick:()=>U(s),className:"px-6 py-2 rounded-xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Open"})]})})]},s.id))})]})})]})]})}):e.jsx("div",{className:"rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700",children:"You do not have permission to manage WhatsApp configurations."})}export{pe as WhatsappMaster};
