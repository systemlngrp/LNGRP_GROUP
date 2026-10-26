import{u as K,a as J,r,j as e,S as V,Y as Q,aV as $}from"./index-CQq4Edtc.js";import{c as X}from"./masterPermissions-DlO3FJ37.js";import{Q as Z,D as ee}from"./qcScore-BMhdzvfE.js";const j="/quality/complaints/form",se=`🚨 *QC Complaint Alert*

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
{{printingArtwork}}`,re="/quality/printing-qc/form",oe="/reports/printing-shift",ne=`*Printing Report ({{shiftHours}}) {{date}}*

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
*Operator Name:* {{operatorName}}`;function E(n){return n===Z?ee:n===oe?ne:n===te?ae:n===re?le:se}function ie(n){const x=[],u=new Set,h=(a,d)=>{if("items"in a){a.items.forEach(y=>h(y,a.section));return}!a.href||u.has(a.href)||(u.add(a.href),x.push({label:`${d} / ${a.name}`,value:a.href}))};return n.forEach(a=>a.items.forEach(d=>h(d,a.section))),x.sort((a,d)=>a.label.localeCompare(d.label))}function pe(){const{user:n}=K(),x=X(n?.role),[u,,,h]=J("whatsapp_configs",[]),[a,d]=r.useState(""),[y,C]=r.useState(!1),[i,v]=r.useState(null),[k,b]=r.useState(""),[P,g]=r.useState(""),[M,f]=r.useState(""),[T,N]=r.useState(""),[D,m]=r.useState(""),[R,S]=r.useState("Yes"),[L,O]=r.useState(!1),[I,_]=r.useState(null),[W,p]=r.useState(""),w=r.useMemo(()=>ie($),[]),A=r.useMemo(()=>{const s=a.trim().toLowerCase();return[...u].filter(t=>!s||[t.loginId,t.groupId,t.menu,t.message].some(l=>String(l||"").toLowerCase().includes(s))).sort((t,l)=>String(t.loginId).localeCompare(String(l.loginId)))},[u,a]),B=()=>{v(null),b(""),g(""),f(""),N(j),m(E(j)),S("Yes"),C(!1)},q=()=>{v(null),b(""),g(""),f(""),N(j),m(E(j)),S("Yes"),C(!0)},U=s=>{v(s.id),b(s.loginId),g(""),f(s.groupId),N(s.menu),m(s.message),S(s.active==="No"?"No":"Yes"),C(!0)},z=async s=>{s.preventDefault();const t={loginId:k.trim(),pass:P,groupId:M.trim(),menu:T.trim(),message:D.trim()};if(!t.loginId||!t.groupId||!t.menu||!t.message||!i&&!t.pass){alert("LoginID, Pass, GroupId, Menu, and Message are required.");return}if(t.pass.trim()==="********"){alert("Enter the real Pass; the masked value cannot be saved as a password.");return}if(u.some(o=>o.id!==i&&o.loginId.trim().toLowerCase()===t.loginId.toLowerCase()&&o.groupId.trim().toLowerCase()===t.groupId.toLowerCase()&&o.menu===t.menu)){alert("A WhatsApp configuration already exists for this LoginID, GroupId, and Menu.");return}O(!0);try{const o=new Date().toISOString(),c={id:i||crypto.randomUUID(),loginId:t.loginId,groupId:t.groupId,menu:t.menu,message:t.message,active:R,updatedBy:n?.name||n?.email||"System User",updateTimestamp:o},F=t.pass?{...c,pass:t.pass}:c,G=await fetch("/api/whatsapp-configs",{method:"POST",headers:{"Content-Type":"application/json",...Q()},body:JSON.stringify(F)});if(!G.ok){const Y=await G.json().catch(()=>({}));throw new Error(Y?.error||"Failed to save WhatsApp configuration.")}await h.refresh({force:!0}),B()}catch(o){console.error("Failed to save WhatsApp configuration:",o);const c=o.message;alert(new Set(["Pass is required for a new WhatsApp configuration.","Enter the real Pass; the masked value cannot be saved as a password.","The stored Pass must be replaced. Enter the current Message Auto Sender password."]).has(c)?c:"Failed to save WhatsApp configuration.")}finally{O(!1)}},H=async s=>{if(!(s.active==="No"||I)){_(s.id),p("");try{const l=await(await fetch(`/api/whatsapp-configs/${encodeURIComponent(s.id)}/send-current`,{method:"POST",headers:{"Content-Type":"application/json",...Q()}})).json().catch(()=>({})),o=String(l.status||"Failed");p(o==="Sent"?`Current ${w.find(c=>c.value===s.menu)?.label||s.menu} message sent successfully.`:o==="No Current Data"?l.error||"No current data is available for this template.":o==="Not Configured"?l.error||"This WhatsApp configuration is not active or configured.":l.error||"Current WhatsApp message could not be sent.")}catch{p("Current WhatsApp message could not be sent.")}finally{_(null)}}};return x?e.jsx("div",{className:"space-y-6",children:y?e.jsxs("div",{className:"bg-white p-6 rounded-[24px] shadow-sm border border-slate-200",children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-start gap-4 mb-8",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:i?"Edit WhatsApp Configuration":"New WhatsApp Configuration"}),e.jsx("p",{className:"text-slate-500 mt-1",children:"Save a message template for one application menu."})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("button",{type:"button",onClick:B,className:"px-8 py-3 rounded-2xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Cancel"}),e.jsx("button",{type:"submit",form:"whatsapp-form",disabled:L,className:"px-8 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800 disabled:opacity-50",children:L?e.jsx(V,{size:18,className:"text-white"}):"Save"})]})]}),e.jsxs("form",{id:"whatsapp-form",onSubmit:z,className:"grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl",children:[e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["LoginID ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:k,onChange:s=>b(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Pass ",e.jsx("span",{className:"text-red-500",children:i?"":"*"})]}),e.jsx("input",{type:"password",value:P,onChange:s=>g(s.target.value),required:!i,placeholder:i?"Leave blank to keep current password":"Enter password",className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["GroupId ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:M,onChange:s=>f(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Menu ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsxs("select",{value:T,onChange:s=>{const t=s.target.value;N(t),i||m(E(t))},required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"",children:"Select menu"}),w.map(s=>e.jsx("option",{value:s.value,children:s.label},s.value))]})]}),e.jsxs("label",{className:"space-y-2 md:col-span-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Auto-message template ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("textarea",{value:D,onChange:s=>m(s.target.value),required:!0,rows:5,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsx("span",{className:"text-blue-700 font-bold",children:"Status"}),e.jsxs("select",{value:R,onChange:s=>S(s.target.value==="No"?"No":"Yes"),className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"Yes",children:"Active"}),e.jsx("option",{value:"No",children:"Inactive"})]})]})]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-center gap-4",children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:"WhatsApp Master"}),e.jsxs("div",{className:"flex flex-wrap items-center gap-3",children:[e.jsx("input",{value:a,onChange:s=>d(s.target.value),placeholder:"Search WhatsApp configuration",className:"w-[360px] max-w-full rounded-full border border-slate-300 px-6 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"}),e.jsx("button",{type:"button",onClick:q,className:"px-7 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800",children:"+ WhatsApp"})]})]}),W?e.jsx("div",{role:"status",className:"rounded-2xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700",children:W}):null,e.jsxs("div",{className:"bg-white rounded-[22px] border border-slate-300 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-3 text-slate-600",children:["Showing ",A.length," entries"]}),e.jsx("div",{className:"table-sticky-scroll",children:e.jsxs("table",{className:"min-w-full border-collapse",children:[e.jsx("thead",{className:"sticky top-0 z-30",children:e.jsxs("tr",{className:"bg-indigo-700 text-white",children:[e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"LoginID"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Pass"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"GroupId"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Menu"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Message"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Status"}),e.jsx("th",{className:"px-4 py-4 text-right text-sm font-bold border-2 border-black",children:"Action"})]})}),e.jsx("tbody",{children:A.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:7,className:"px-6 py-10 text-center border-2 border-black",children:"No WhatsApp configurations found."})}):A.map(s=>e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-4 font-bold border-2 border-black",children:s.loginId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black tracking-widest",children:"********"}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.groupId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:w.find(t=>t.value===s.menu)?.label||s.menu}),e.jsx("td",{className:"px-4 py-4 border-2 border-black whitespace-pre-wrap max-w-[360px]",children:s.message}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.active==="No"?"Inactive":"Active"}),e.jsx("td",{className:"px-4 py-3 text-right border-2 border-black",children:e.jsxs("div",{className:"flex flex-wrap justify-end gap-2",children:[e.jsx("button",{type:"button",onClick:()=>{H(s)},disabled:s.active==="No"||!!I,className:"px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50",children:I===s.id?"Sending...":"Send Current"}),e.jsx("button",{type:"button",onClick:()=>U(s),className:"px-6 py-2 rounded-xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Open"})]})})]},s.id))})]})})]})]})}):e.jsx("div",{className:"rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700",children:"You do not have permission to manage WhatsApp configurations."})}export{pe as WhatsappMaster};
