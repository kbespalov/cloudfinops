import {redirect} from 'next/navigation';

/** Legacy hub — shareable entry points are /calculator/vm and /calculator/self-host. */
export default function CalculatorIndex() {
  redirect('/calculator/vm');
}
