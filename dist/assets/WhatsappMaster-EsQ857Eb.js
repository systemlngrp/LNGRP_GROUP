import{u as K,a as $,r as n,j as e,S as J,Y as B,aV as V}from"./index-CKkFlU4R.js";import{c as X}from"./masterPermissions-DlO3FJ37.js";import{Q as Z,D as ee}from"./qcScore-C-jCLqX-.js";const j="/quality/complaints/form",te=`🚨 *QC Complaint Alert*

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

Please review this complaint and take the necessary action.`,se="/quality/boardline-qc/form",ae=`📋 *BOARDLINE QC CHECK*

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
{{printingArtwork}}`,re="/quality/printing-qc/form",ne="/reports/printing-shift",oe="/loading/master",le="/material-in/master",ie="/material-movement/reel-return",de=`*Printing Report ({{shiftHours}}) {{date}}*

{{jobLines}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`,ce=`🚚 *LOADING SLIP*

*Slip No.:* {{slipNo}}
*Date:* {{date}}
*Customer:* {{customer}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Truck No.:* {{truckNo}}
*Total Quantity:* {{totalQty}}
*Loading Source:* {{loadingSource}}

📄 Loading Slip PDF attached.`,ue=`📦 *MATERIAL RECEIPT REPORT (MRR)*

*MRR No.:* {{transactionNo}}
*MRR Date:* {{date}}
*Supplier:* {{supplier}}
*Invoice No.:* {{invoiceNo}}
*Invoice Date:* {{invDate}}
*MRR Type:* {{mrrType}}
*Total Quantity:* {{totalQty}}
*Total Amount:* {{totalAmount}}
*Reel Count:* {{reelCount}}

📄 MRR PDF and applicable Reel Label PDFs are attached.`,pe=`🔁 *REEL RETURN*

*Return No.:* {{returnNo}}
*Date:* {{date}}
*Job No.:* {{jobNo}}
*Total Reels:* {{totalReels}}
*Total Weight:* {{totalWeightKg}} KG
*Remarks:* {{remarks}}

📄 Reel Return PDF attached.`,me=`🖨️ *PRINTING QC CHECK*

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
*Operator Name:* {{operatorName}}`;function R(o){return o===Z?ee:o===ne?de:o===oe?ce:o===le?ue:o===ie?pe:o===se?ae:o===re?me:te}function xe(o){const h=[],m=new Set,b=(a,u)=>{if("items"in a){a.items.forEach(v=>b(v,a.section));return}!a.href||m.has(a.href)||(m.add(a.href),h.push({label:`${u} / ${a.name}`,value:a.href}))};return o.forEach(a=>a.items.forEach(u=>b(u,a.section))),h.sort((a,u)=>a.label.localeCompare(u.label))}function fe(){const{user:o}=K(),h=X(o?.role),[m,,,b]=$("whatsapp_configs",[]),[a,u]=n.useState(""),[v,C]=n.useState(!1),[c,I]=n.useState(null),[k,g]=n.useState(""),[M,f]=n.useState(""),[T,N]=n.useState(""),[P,S]=n.useState(""),[D,x]=n.useState(""),[L,y]=n.useState("Yes"),[_,F]=n.useState(!1),[A,O]=n.useState(null),[i,d]=n.useState(null),E=n.useMemo(()=>xe(V),[]),w=n.useMemo(()=>{const t=a.trim().toLowerCase();return[...m].filter(s=>!t||[s.loginId,s.groupId,s.menu,s.message].some(p=>String(p||"").toLowerCase().includes(t))).sort((s,p)=>String(s.loginId).localeCompare(String(p.loginId)))},[m,a]),G=()=>{I(null),g(""),f(""),N(""),S(j),x(R(j)),y("Yes"),C(!1)},U=()=>{I(null),g(""),f(""),N(""),S(j),x(R(j)),y("Yes"),C(!0)},q=t=>{I(t.id),g(t.loginId),f(""),N(t.groupId),S(t.menu),x(t.message),y(t.active==="No"?"No":"Yes"),C(!0)},z=async t=>{t.preventDefault();const s={loginId:k.trim(),pass:M,groupId:T.trim(),menu:P.trim(),message:D.trim()};if(!s.loginId||!s.groupId||!s.menu||!s.message||!c&&!s.pass){alert("LoginID, Pass, GroupId, Menu, and Message are required.");return}if(s.pass.trim()==="********"){alert("Enter the real Pass; the masked value cannot be saved as a password.");return}if(m.some(r=>r.id!==c&&r.loginId.trim().toLowerCase()===s.loginId.toLowerCase()&&r.groupId.trim().toLowerCase()===s.groupId.toLowerCase()&&r.menu===s.menu)){alert("A WhatsApp configuration already exists for this LoginID, GroupId, and Menu.");return}F(!0);try{const r=new Date().toISOString(),l={id:c||crypto.randomUUID(),loginId:s.loginId,groupId:s.groupId,menu:s.menu,message:s.message,active:L,updatedBy:o?.name||o?.email||"System User",updateTimestamp:r},Q=s.pass?{...l,pass:s.pass}:l,W=await fetch("/api/whatsapp-configs",{method:"POST",headers:{"Content-Type":"application/json",...B()},body:JSON.stringify(Q)});if(!W.ok){const Y=await W.json().catch(()=>({}));throw new Error(Y?.error||"Failed to save WhatsApp configuration.")}await b.refresh({force:!0}),G()}catch(r){console.error("Failed to save WhatsApp configuration:",r);const l=r.message;alert(new Set(["Pass is required for a new WhatsApp configuration.","Enter the real Pass; the masked value cannot be saved as a password.","The stored Pass must be replaced. Enter the current Message Auto Sender password."]).has(l)?l:"Failed to save WhatsApp configuration.")}finally{F(!1)}},H=async t=>{if(t.active==="No"||A)return;O(t.id);const s=E.find(p=>p.value===t.menu)?.label||t.menu;d({kind:"sending",menuLabel:s});try{const r=await(await fetch(`/api/whatsapp-configs/${encodeURIComponent(t.id)}/send-current`,{method:"POST",headers:{"Content-Type":"application/json",...B()}})).json().catch(()=>({})),l=String(r.status||"Failed");l==="Sent"&&r.warning?d({kind:"success",menuLabel:s,message:String(r.warning)}):l==="Sent"&&r.templateFallback?d({kind:"success",menuLabel:s,message:"Template sent successfully. No current data was found, so the saved template was sent as-is."}):l==="Sent"&&r.attachmentsSent?d({kind:"success",menuLabel:s,message:"Message sent successfully with photos/PDF."}):d(l==="Sent"?{kind:"success",menuLabel:s,message:"Message sent successfully."}:l==="No Current Data"?{kind:"no-current-data",menuLabel:s,message:"No current data is available for this template."}:l==="Not Configured"?{kind:"not-configured",menuLabel:s,message:"No active WhatsApp configuration or valid credentials found."}:{kind:"failure",menuLabel:s,message:r.error||"Message sending failed."})}catch{d({kind:"failure",menuLabel:s,message:"Message sending failed. Please try again."})}finally{O(null)}};return h?e.jsx("div",{className:"space-y-6",children:v?e.jsxs("div",{className:"bg-white p-6 rounded-[24px] shadow-sm border border-slate-200",children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-start gap-4 mb-8",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:c?"Edit WhatsApp Configuration":"New WhatsApp Configuration"}),e.jsx("p",{className:"text-slate-500 mt-1",children:"Save a message template for one application menu."})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("button",{type:"button",onClick:G,className:"px-8 py-3 rounded-2xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Cancel"}),e.jsx("button",{type:"submit",form:"whatsapp-form",disabled:_,className:"px-8 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800 disabled:opacity-50",children:_?e.jsx(J,{size:18,className:"text-white"}):"Save"})]})]}),e.jsxs("form",{id:"whatsapp-form",onSubmit:z,className:"grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl",children:[e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["LoginID ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:k,onChange:t=>g(t.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Pass ",e.jsx("span",{className:"text-red-500",children:c?"":"*"})]}),e.jsx("input",{type:"password",value:M,onChange:t=>f(t.target.value),required:!c,placeholder:c?"Leave blank to keep current password":"Enter password",className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["GroupId ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:T,onChange:t=>N(t.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Menu ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsxs("select",{value:P,onChange:t=>{const s=t.target.value;S(s),c||x(R(s))},required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"",children:"Select menu"}),E.map(t=>e.jsx("option",{value:t.value,children:t.label},t.value))]})]}),e.jsxs("label",{className:"space-y-2 md:col-span-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Auto-message template ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("textarea",{value:D,onChange:t=>x(t.target.value),required:!0,rows:5,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsx("span",{className:"text-blue-700 font-bold",children:"Status"}),e.jsxs("select",{value:L,onChange:t=>y(t.target.value==="No"?"No":"Yes"),className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"Yes",children:"Active"}),e.jsx("option",{value:"No",children:"Inactive"})]})]})]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-center gap-4",children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:"WhatsApp Master"}),e.jsxs("div",{className:"flex flex-wrap items-center gap-3",children:[e.jsx("input",{value:a,onChange:t=>u(t.target.value),placeholder:"Search WhatsApp configuration",className:"w-[360px] max-w-full rounded-full border border-slate-300 px-6 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"}),e.jsx("button",{type:"button",onClick:U,className:"px-7 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800",children:"+ WhatsApp"})]})]}),i?e.jsxs("div",{role:i.kind==="failure"?"alert":"status",className:`flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 font-semibold ${i.kind==="success"?"border-emerald-300 bg-emerald-50 text-emerald-800":i.kind==="failure"?"border-red-300 bg-red-50 text-red-800":i.kind==="sending"?"border-blue-300 bg-blue-50 text-blue-800":"border-amber-300 bg-amber-50 text-amber-800"}`,children:[e.jsx("span",{children:i.kind==="sending"?`Sending current ${i.menuLabel} message...`:`${i.menuLabel}: ${i.message}`}),i.kind!=="sending"?e.jsx("button",{type:"button",onClick:()=>d(null),"aria-label":"Dismiss send result",className:"shrink-0 rounded-lg px-2 text-lg leading-none hover:bg-black/10",children:"×"}):null]}):null,e.jsxs("div",{className:"bg-white rounded-[22px] border border-slate-300 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-3 text-slate-600",children:["Showing ",w.length," entries"]}),e.jsx("div",{className:"table-sticky-scroll",children:e.jsxs("table",{className:"min-w-full border-collapse",children:[e.jsx("thead",{className:"sticky top-0 z-30",children:e.jsxs("tr",{className:"bg-indigo-700 text-white",children:[e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"LoginID"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Pass"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"GroupId"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Menu"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Message"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Status"}),e.jsx("th",{className:"px-4 py-4 text-right text-sm font-bold border-2 border-black",children:"Action"})]})}),e.jsx("tbody",{children:w.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:7,className:"px-6 py-10 text-center border-2 border-black",children:"No WhatsApp configurations found."})}):w.map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-4 font-bold border-2 border-black",children:t.loginId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black tracking-widest",children:"********"}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:t.groupId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:E.find(s=>s.value===t.menu)?.label||t.menu}),e.jsx("td",{className:"px-4 py-4 border-2 border-black whitespace-pre-wrap max-w-[360px]",children:t.message}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:t.active==="No"?"Inactive":"Active"}),e.jsx("td",{className:"px-4 py-3 text-right border-2 border-black",children:e.jsxs("div",{className:"flex flex-wrap justify-end gap-2",children:[e.jsx("button",{type:"button",onClick:()=>{H(t)},disabled:t.active==="No"||!!A,className:"px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50",children:A===t.id?"Sending...":"Send Current"}),e.jsx("button",{type:"button",onClick:()=>q(t),className:"px-6 py-2 rounded-xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Open"})]})})]},t.id))})]})})]})]})}):e.jsx("div",{className:"rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700",children:"You do not have permission to manage WhatsApp configurations."})}export{fe as WhatsappMaster};
