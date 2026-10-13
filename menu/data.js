/* =========================================================
   بيانات المطعم والمنيو: هذا الملف الوحيد اللي يتعدّل
   ========================================================= */
window.NADIL_DATA = {
  restaurant: {
    name: "مطعمك هنا",              // اسم المطعم
    nameEn: "Your Restaurant",
    tagline: "منيو تجريبي من نادل",
    logo: "",                        // رابط الشعار (اختياري)
    color: "#8E1B2C",                // لون المطعم الأساسي
    currency: "ر.س",
    vatNote: "الأسعار شاملة ضريبة القيمة المضافة"
  },

  /* الطاولات: رقم الطاولة + رمز قصير. لتوليد كود جديد لطاولة نغيّر رمزها فقط */
  tables: [
    {n:1,k:"A7"},{n:2,k:"B3"},{n:3,k:"C9"},{n:4,k:"D2"},{n:5,k:"E6"},
    {n:6,k:"F4"},{n:7,k:"G8"},{n:8,k:"H5"},{n:9,k:"J2"},{n:10,k:"K7"},
    {n:11,k:"L3"},{n:12,k:"M9"}
  ],

  categories: [
    {id:"main", name:"الأطباق الرئيسية", en:"Mains"},
    {id:"start", name:"المقبلات والسلطات", en:"Starters & Salads"},
    {id:"drink", name:"المشروبات", en:"Drinks"},
    {id:"sweet", name:"الحلا", en:"Desserts"}
  ],

  /* opts: مجموعات الخيارات. type "one" اختيار واحد، "many" أكثر من خيار. p = فرق السعر */
  items: [
    {id:"kabsa", cat:"main", name:"كبسة لحم", en:"Lamb Kabsa", desc:"لحم حاشي مع رز بسمتي وبهارات الكبسة.", price:58, cal:920, tag:"الأكثر طلباً", bg:"#F6E4E6",
     opts:[{t:"الحجم", type:"one", req:true, c:[{n:"نفر",p:0},{n:"نفرين",p:52},{n:"عائلي",p:140}]},
           {t:"نوع الرز", type:"one", req:true, c:[{n:"بسمتي",p:0},{n:"مندي",p:0}]},
           {t:"إضافات", type:"many", c:[{n:"دقوس",p:3},{n:"لبن",p:4},{n:"سلطة",p:8}]}]},
    {id:"mandi", cat:"main", name:"مندي دجاج", en:"Chicken Mandi", desc:"نص حبة دجاج مندي على رز مدخّن.", price:46, cal:780, bg:"#FBF0DA",
     opts:[{t:"الكمية", type:"one", req:true, c:[{n:"نص حبة",p:0},{n:"حبة كاملة",p:40}]},
           {t:"إضافات", type:"many", c:[{n:"دقوس",p:3},{n:"لبن",p:4}]}]},
    {id:"mathbi", cat:"main", name:"مظبي دجاج", en:"Grilled Chicken Mathbi", desc:"دجاج مشوي على الحجر مع رز.", price:44, cal:690, bg:"#FCEBD9",
     opts:[{t:"الكمية", type:"one", req:true, c:[{n:"نص حبة",p:0},{n:"حبة كاملة",p:38}]}]},
    {id:"jareesh", cat:"main", name:"جريش", en:"Jareesh", desc:"جريش بالدجاج على الطريقة النجدية.", price:24, cal:480, bg:"#EFE7DA"},

    {id:"salad", cat:"start", name:"سلطة دقوس", en:"Daqoos Salad", desc:"طماطم وخيار وفلفل مع صلصة الدقوس.", price:12, cal:140, bg:"#E1F3EA"},
    {id:"soup", cat:"start", name:"شوربة عدس", en:"Lentil Soup", desc:"شوربة عدس مع ليمون وخبز محمص.", price:14, cal:210, bg:"#FCEBD9"},
    {id:"hummus", cat:"start", name:"حمص", en:"Hummus", desc:"حمص بالطحينة وزيت الزيتون.", price:16, cal:330, bg:"#F4EFE6"},

    {id:"coffee", cat:"drink", name:"قهوة سعودية", en:"Saudi Coffee", desc:"دلة قهوة مع تمر.", price:18, cal:120, bg:"#E3ECF8",
     opts:[{t:"الحجم", type:"one", req:true, c:[{n:"دلة صغيرة",p:0},{n:"دلة كبيرة",p:12}]}]},
    {id:"lemon", cat:"drink", name:"ليمون بالنعناع", en:"Mint Lemonade", desc:"ليمون طازج ونعناع.", price:16, cal:180, bg:"#E6F4D9",
     opts:[{t:"السكر", type:"one", req:true, c:[{n:"عادي",p:0},{n:"خفيف",p:0},{n:"بدون",p:0}]}]},
    {id:"laban", cat:"drink", name:"لبن", en:"Laban", desc:"لبن بارد.", price:4, cal:110, bg:"#F2F2F2"},
    {id:"water", cat:"drink", name:"ماء", en:"Water", desc:"", price:2, cal:0, bg:"#E3F1F8"},

    {id:"kunafa", cat:"sweet", name:"كنافة", en:"Kunafa", desc:"كنافة بالقشطة.", price:18, cal:540, bg:"#FBF0DA"},
    {id:"umali", cat:"sweet", name:"أم علي", en:"Om Ali", desc:"أم علي ساخنة بالمكسرات.", price:16, cal:460, bg:"#F6E4E6"}
  ]
};
