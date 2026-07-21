import {redirect} from 'next/navigation';

/** Shareable entry — interactive calculator lives at /calculator/vm. */
export default function CalculatorIndex() {
  redirect('/calculator/vm');
}
