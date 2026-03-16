const str = "2025-02-04";
const regex = /(\d{4})-(\d{2})-(\d{2})/;

const result = str.replace(regex, (match, year, month, date) => {
  console.log("match,  year, month, date: ", match, year, month, date);
  return `${date}/${month}/${year}`;
});

console.log("result: ", result);
